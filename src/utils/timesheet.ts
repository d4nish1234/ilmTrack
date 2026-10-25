/**
 * Timesheets for org admins: a teacher's scheduled shifts next to what they
 * actually worked, totals, and the CSV export. Pure, so it is unit-tested
 * directly (tests/timesheet.test.ts).
 *
 * Like the teacher's view (utils/timeclock.ts shiftViews), rows come from the
 * schedule *and* the time entries: a shift deleted after it was worked still
 * has hours, so it still appears.
 */
import { format, parseISO } from 'date-fns';
import type { Shift, TimeEntry } from '../types';
import { formatDuration, shiftMinutes } from './timekeeping';
import { wallTime, workedMs, zonedTimeToInstant } from './timeclock';

/** 'late': the shift is on now but wasn't started; 'not-started': it's over and wasn't. */
export type RowStatus = 'upcoming' | 'late' | 'not-started' | 'running' | 'paused' | 'worked';

export interface TimesheetRow {
  shiftId: string;
  date: string;
  /** Scheduled times, 'HH:mm' (org time); for a deleted shift, the entry's. */
  start: string;
  end: string;
  locationName: string;
  /** No longer on the schedule (deleted or moved after it was worked). */
  removed: boolean;
  entry: TimeEntry | null;
  status: RowStatus;
  scheduledMinutes: number;
  workedMinutes: number;
  /** Worked from/to, 'HH:mm' org time, when known. */
  workedFrom: string | null;
  workedTo: string | null;
}

export interface TimesheetTeacher {
  uid: string;
  name: string;
  email: string;
}

function statusOf(entry: TimeEntry | null, endInstant: number, startInstant: number, now: number): RowStatus {
  if (entry?.status === 'running' && now < entry.endAt.toMillis()) return 'running';
  if (entry?.status === 'paused' && now < entry.endAt.toMillis()) return 'paused';
  if (entry) return 'worked';
  if (now >= endInstant) return 'not-started';
  return now >= startInstant ? 'late' : 'upcoming';
}

/** One teacher's week: every scheduled shift, plus worked shifts no longer scheduled. */
export function timesheetRows(
  shifts: Shift[],
  entries: TimeEntry[],
  locationNames: Map<string, string>,
  timeZone: string,
  now: number
): TimesheetRow[] {
  const byShift = new Map(entries.map((e) => [`${e.date}_${e.shiftId}`, e]));
  const rowFor = (entry: TimeEntry | null, base: { shiftId: string; date: string; start: string; end: string; locationName: string; removed: boolean }): TimesheetRow => {
    const startInstant = entry ? entry.startAt.toMillis() : zonedTimeToInstant(base.date, base.start, timeZone);
    const endInstant = entry ? entry.endAt.toMillis() : zonedTimeToInstant(base.date, base.end, timeZone);
    const segments = entry?.segments ?? [];
    const firstStart = segments[0]?.start.toMillis();
    const lastEnd = segments.length ? segments[segments.length - 1].end?.toMillis() : undefined;
    return {
      ...base,
      entry,
      status: statusOf(entry, endInstant, startInstant, now),
      scheduledMinutes: shiftMinutes(base),
      workedMinutes: entry
        ? entry.status === 'done' && typeof entry.workedMinutes === 'number'
          ? entry.workedMinutes
          : Math.floor(workedMs(entry, startInstant, endInstant, now) / 60_000)
        : 0,
      workedFrom: firstStart !== undefined ? wallTime(Math.max(firstStart, startInstant), timeZone) : null,
      workedTo: lastEnd !== undefined ? wallTime(lastEnd, timeZone) : null,
    };
  };

  const rows = shifts.map((s) =>
    rowFor(byShift.get(`${s.date}_${s.id}`) ?? null, {
      shiftId: s.id,
      date: s.date,
      start: s.start,
      end: s.end,
      locationName: locationNames.get(s.locationId) ?? 'Location removed',
      removed: false,
    })
  );

  const scheduled = new Set(shifts.map((s) => `${s.date}_${s.id}`));
  for (const e of entries) {
    if (scheduled.has(`${e.date}_${e.shiftId}`)) continue;
    rows.push(
      rowFor(e, {
        shiftId: e.shiftId,
        date: e.date,
        start: wallTime(e.startAt.toMillis(), timeZone),
        end: wallTime(e.endAt.toMillis(), timeZone),
        locationName: e.locationName,
        removed: true,
      })
    );
  }

  return rows.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

export function totals(rows: TimesheetRow[]) {
  return {
    // A removed shift is no longer scheduled; its hours still count as worked.
    scheduledMinutes: rows.filter((r) => !r.removed).reduce((sum, r) => sum + r.scheduledMinutes, 0),
    workedMinutes: rows.reduce((sum, r) => sum + r.workedMinutes, 0),
  };
}

/** '5h 20m / 6h' */
export function workedOfScheduled(rows: TimesheetRow[]): string {
  const t = totals(rows);
  return `${formatDuration(t.workedMinutes)} / ${formatDuration(t.scheduledMinutes)}`;
}

/** Who is on shift right now, from this week's entries. */
export function clockedInNow(entries: TimeEntry[], now: number): TimeEntry[] {
  return entries.filter((e) => (e.status === 'running' || e.status === 'paused') && now < e.endAt.toMillis());
}

// ─── CSV ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RowStatus, string> = {
  upcoming: 'Upcoming',
  late: 'Not started',
  'not-started': 'Not started',
  running: 'On shift',
  paused: 'On break',
  worked: 'Worked',
};

/** Quote a field when it has a comma, quote or line break; also neutralise
 * spreadsheet formulas (a leading = + - @, tab or CR), which a teacher's note
 * could hold. */
export function csvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = [
  'Teacher', 'Email', 'Date', 'Day', 'Scheduled start', 'Scheduled end', 'Location',
  'Worked from', 'Worked to', 'Worked minutes', 'Worked (h:mm)', 'Status',
  'Edited by admin', 'Edit reason', 'Teacher note',
];

/** One CSV for any number of teachers' weeks. */
export function timesheetCsv(weeks: { teacher: TimesheetTeacher; rows: TimesheetRow[] }[]): string {
  const lines = [CSV_HEADER.map(csvField).join(',')];
  for (const { teacher, rows } of weeks) {
    for (const r of rows) {
      const hhmm = `${Math.floor(r.workedMinutes / 60)}:${String(r.workedMinutes % 60).padStart(2, '0')}`;
      lines.push(
        [
          teacher.name,
          teacher.email,
          r.date,
          format(parseISO(r.date), 'EEE'),
          r.start,
          r.end,
          r.removed ? `${r.locationName} (shift removed)` : r.locationName,
          r.workedFrom ?? '',
          r.workedTo ?? '',
          r.workedMinutes,
          hhmm,
          STATUS_LABEL[r.status],
          r.entry?.correction ? 'Yes' : 'No',
          r.entry?.correction?.reason ?? '',
          r.entry?.note ?? '',
        ]
          .map(csvField)
          .join(',')
      );
    }
  }
  // CRLF, the line ending spreadsheets expect.
  return lines.join('\r\n') + '\r\n';
}

/** 'timesheet-test-school-2026-10-12.csv' */
export function csvFileName(parts: string[], weekStart: string): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `timesheet-${slug || 'week'}-${weekStart}.csv`;
}

