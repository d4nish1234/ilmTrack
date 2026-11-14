/**
 * The timesheet PDF that org admins export: any people, any dates. Pure (the
 * screen fetches the weeks and prints the HTML), so it is unit-tested
 * directly (tests/timesheetExport.test.ts).
 *
 * Shifts are stored a week per document, so a date range is read as the
 * weeks it touches and then trimmed to its days (rowsInRange).
 */
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { formatDuration, formatTime, shiftWeek, weekStartOf } from './timekeeping';
import { STATUS_LABEL, type TimesheetRow, type TimesheetTeacher } from './timesheet';

/** About six months: a term, without one export reading a year of weeks. */
export const EXPORT_MAX_DAYS = 186;

/** Both 'yyyy-MM-dd', inclusive. */
export interface DateRange {
  from: string;
  to: string;
}

const DATE_FORMAT = 'yyyy-MM-dd';
const day = (date: Date) => format(date, DATE_FORMAT);

export function rangeProblem(range: DateRange): string | null {
  if (range.to < range.from) return 'The end date is before the start date.';
  if (differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1 > EXPORT_MAX_DAYS) {
    return 'Choose up to six months at a time.';
  }
  return null;
}

/** The Mondays of every week the range touches. */
export function rangeWeeks(range: DateRange): string[] {
  const last = weekStartOf(parseISO(range.to));
  const weeks: string[] = [];
  for (let w = weekStartOf(parseISO(range.from)); w <= last; w = shiftWeek(w, 1)) weeks.push(w);
  return weeks;
}

/** The most chosen people read one by one; past this, the whole organization is read in fewer requests. */
export const CHOSEN_READ_MAX = 10;

/**
 * Whether to read just the chosen people's weeks rather than the whole
 * organization's. Reading a person's week costs about two reads whether or
 * not they worked; reading the organization's costs one per document, about
 * five a person a week. So it pays whenever some people are left out, up to
 * CHOSEN_READ_MAX people.
 */
export function readChosenOnly(chosen: number | null, everyone: number): boolean {
  return chosen !== null && chosen <= CHOSEN_READ_MAX && chosen < everyone;
}

export type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month';

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
];

/** A whole week (Monday to Sunday). */
export function weekRange(weekStart: string): DateRange {
  return { from: weekStart, to: day(addDays(parseISO(weekStart), 6)) };
}

/** `today` is the organization's ('yyyy-MM-dd'). Whole weeks and months, including days still to come. */
export function presetRange(preset: RangePreset, today: string): DateRange {
  const date = parseISO(today);
  switch (preset) {
    case 'this-week':
      return weekRange(weekStartOf(date));
    case 'last-week':
      return weekRange(shiftWeek(weekStartOf(date), -1));
    case 'this-month':
      return { from: day(startOfMonth(date)), to: day(endOfMonth(date)) };
    case 'last-month': {
      const last = addMonths(date, -1);
      return { from: day(startOfMonth(last)), to: day(endOfMonth(last)) };
    }
  }
}

/** The preset these dates are, to highlight its chip; null for any other dates. */
export function matchingPreset(range: DateRange, today: string): RangePreset | null {
  const match = RANGE_PRESETS.find(({ key }) => {
    const p = presetRange(key, today);
    return p.from === range.from && p.to === range.to;
  });
  return match?.key ?? null;
}

export function rowsInRange(rows: TimesheetRow[], range: DateRange): TimesheetRow[] {
  return rows.filter((r) => r.date >= range.from && r.date <= range.to);
}

export interface PersonTotals {
  /** Shifts still on the schedule. */
  shifts: number;
  /** Over, or on now, and never started. */
  notStarted: number;
  scheduledMinutes: number;
  workedMinutes: number;
}

/** Like timesheet.ts `totals`: a removed shift isn't scheduled any more, but its hours still count. */
export function personTotals(rows: TimesheetRow[]): PersonTotals {
  return rows.reduce<PersonTotals>(
    (t, r) => ({
      shifts: t.shifts + (r.removed ? 0 : 1),
      notStarted: t.notStarted + (r.status === 'not-started' || r.status === 'late' ? 1 : 0),
      scheduledMinutes: t.scheduledMinutes + (r.removed ? 0 : r.scheduledMinutes),
      workedMinutes: t.workedMinutes + r.workedMinutes,
    }),
    { shifts: 0, notStarted: 0, scheduledMinutes: 0, workedMinutes: 0 }
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 'Nov 1, 2026 – Nov 30, 2026'; one date when they're the same day. */
export function rangeLabel(range: DateRange): string {
  const label = (d: string) => format(parseISO(d), 'MMM d, yyyy');
  return range.from === range.to ? label(range.from) : `${label(range.from)} – ${label(range.to)}`;
}

export interface ExportPerson {
  teacher: TimesheetTeacher;
  /** Already trimmed to the range. */
  rows: TimesheetRow[];
}

interface TimesheetHtmlInput {
  orgName: string;
  range: DateRange;
  timezone: string;
  people: ExportPerson[];
  /** When it was made, shown in the header: 'Nov 13, 2026, 4:05 PM'. */
  preparedAt: string;
}

const hours = (minutes: number) => (minutes === 0 ? '0h' : formatDuration(minutes));

function personSection({ teacher, rows }: ExportPerson): string {
  const t = personTotals(rows);
  const body =
    rows.length === 0
      ? '<tr><td colspan="6" class="empty">No shifts in these dates.</td></tr>'
      : rows
          .map((r) => {
            const notes = [
              r.removed ? 'Shift removed from the schedule after it was worked.' : '',
              r.entry?.correction ? `Edited by admin: ${r.entry.correction.reason}` : '',
              r.entry?.note ? `Teacher's note: ${r.entry.note}` : '',
            ].filter(Boolean);
            const status = STATUS_LABEL[r.status];
            return `
      <tr class="${notes.length ? 'has-notes' : ''}">
        <td>${escapeHtml(format(parseISO(r.date), 'EEE, MMM d'))}</td>
        <td>${escapeHtml(`${formatTime(r.start)} – ${formatTime(r.end)}`)}</td>
        <td>${escapeHtml(r.locationName)}</td>
        <td>${r.workedFrom ? escapeHtml(`${formatTime(r.workedFrom)} – ${r.workedTo ? formatTime(r.workedTo) : '…'}`) : '—'}</td>
        <td class="num">${r.workedMinutes ? hours(r.workedMinutes) : '—'}</td>
        <td class="status ${r.status}">${status}</td>
      </tr>${
        notes.length
          ? `
      <tr class="notes"><td colspan="6">${notes.map(escapeHtml).join('<br>')}</td></tr>`
          : ''
      }`;
          })
          .join('');

  return `
  <section class="person">
    <h2>${escapeHtml(teacher.name)}</h2>
    ${teacher.email ? `<div class="sub">${escapeHtml(teacher.email)}</div>` : ''}
    <table>
      <thead>
        <tr><th>Date</th><th>Scheduled</th><th>Location</th><th>Worked</th><th class="num">Hours</th><th>Status</th></tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td colspan="4">${t.shifts} ${t.shifts === 1 ? 'shift' : 'shifts'} · ${hours(t.scheduledMinutes)} scheduled</td>
        <td class="num">${hours(t.workedMinutes)}</td><td></td></tr>
      </tfoot>
    </table>
  </section>`;
}

/** The whole PDF, as HTML for expo-print: a summary of everyone, then each person's shifts. */
export function timesheetHtml({ orgName, range, timezone, people, preparedAt }: TimesheetHtmlInput): string {
  const totals = people.map((p) => ({ name: p.teacher.name, ...personTotals(p.rows) }));
  const all = totals.reduce(
    (a, t) => ({
      shifts: a.shifts + t.shifts,
      notStarted: a.notStarted + t.notStarted,
      scheduledMinutes: a.scheduledMinutes + t.scheduledMinutes,
      workedMinutes: a.workedMinutes + t.workedMinutes,
    }),
    { shifts: 0, notStarted: 0, scheduledMinutes: 0, workedMinutes: 0 }
  );

  const summaryRows = totals
    .map(
      (t) => `
      <tr><td>${escapeHtml(t.name)}</td><td class="num">${t.shifts}</td><td class="num">${t.notStarted || '—'}</td>
      <td class="num">${hours(t.scheduledMinutes)}</td><td class="num">${hours(t.workedMinutes)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 36px; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #222; font-size: 11px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #1a73e8; }
  h2 { font-size: 14px; margin: 0 0 2px; break-after: avoid; page-break-after: avoid; }
  .sub { color: #666; margin-bottom: 8px; }
  .meta { color: #666; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; color: #555; border-bottom: 1.5px solid #bbb; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tr.has-notes td { border-bottom: none; }
  tr.notes td { color: #666; font-style: italic; padding-top: 0; }
  tfoot td { font-weight: 600; border-top: 1.5px solid #bbb; border-bottom: none; }
  .num { text-align: right; white-space: nowrap; }
  .status { white-space: nowrap; }
  .status.not-started, .status.late { color: #d32f2f; }
  .status.worked { color: #1e7e34; }
  .empty { color: #888; font-style: italic; }
  .summary { margin-bottom: 26px; }
  .person { margin-bottom: 22px; }
</style>
</head>
<body>
  <h1>Timesheet</h1>
  <div class="meta">
    ${escapeHtml(orgName)} · ${escapeHtml(rangeLabel(range))}<br>
    Times are ${escapeHtml(timezone)} · Prepared ${escapeHtml(preparedAt)}
  </div>

  <section class="summary">
    <h2>Summary</h2>
    <table>
      <thead>
        <tr><th>Person</th><th class="num">Shifts</th><th class="num">Not started</th><th class="num">Scheduled</th><th class="num">Worked</th></tr>
      </thead>
      <tbody>${summaryRows || '<tr><td colspan="5" class="empty">No one had shifts in these dates.</td></tr>'}</tbody>
      <tfoot>
        <tr><td>Total</td><td class="num">${all.shifts}</td><td class="num">${all.notStarted || '—'}</td>
        <td class="num">${hours(all.scheduledMinutes)}</td><td class="num">${hours(all.workedMinutes)}</td></tr>
      </tfoot>
    </table>
  </section>
${people.map(personSection).join('')}
</body>
</html>`;
}

/** 'timesheet-test-school-2026-11-01-to-2026-11-30.pdf' */
export function pdfFileName(orgName: string, range: DateRange): string {
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const dates = range.from === range.to ? range.from : `${range.from}-to-${range.to}`;
  return `timesheet-${slug ? `${slug}-` : ''}${dates}.pdf`;
}
