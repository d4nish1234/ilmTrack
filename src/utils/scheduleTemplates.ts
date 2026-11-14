/**
 * Schedule templates in the app: how they're described, the editor's checks,
 * and the preview of what applying one changes. Pure, so it is unit-tested
 * (tests/scheduleTemplates.test.ts).
 *
 * The server (functions/src/scheduleTemplatesCore.ts parseTemplate) checks
 * templates again and is the authority; templateProblem only gives the admin
 * the same message before they press Save. Keep the two messages in step.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { TemplateApplyResult, TemplateSlot } from '../types';
import { formatTime } from './timekeeping';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Mirrors TEMPLATE_LIMITS on the server. */
export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_SLOTS_MAX = 10;
const SPAN_DAYS_MAX = 366;

/** 'Mon–Thu', 'Mon, Wed, Fri', 'Mon–Wed, Sat', 'Every day'. */
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const run = sorted.slice(i, j + 1).map((d) => WEEKDAYS[d - 1]);
    // Three or more in a row read better as a range.
    parts.push(run.length >= 3 ? `${run[0]}–${run[run.length - 1]}` : run.join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

/** 'Mon–Thu · 4:00 PM–6:00 PM' */
export function slotSummary(slot: Pick<TemplateSlot, 'days' | 'start' | 'end'>): string {
  return `${formatDays(slot.days)} · ${formatTime(slot.start)}–${formatTime(slot.end)}`;
}

/** 'Sep 8 – Dec 18', 'Dec 1, 2026 – Jan 30, 2027'; years shown when not `thisYear`. */
export function dateRangeLabel(startDate: string, endDate: string, thisYear: number): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear && start.getFullYear() === thisYear) return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  if (sameYear) return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

/** The list row's title: its dates, 'Sep 8 – Dec 18'. Schedules have no name on screen. */
export function templateTitle(t: { startDate: string; endDate: string }, thisYear: number): string {
  return dateRangeLabel(t.startDate, t.endDate, thisYear);
}

/** The list row's second line: 'Mon–Thu · 4:00 PM–6:00 PM +1 more · 12 people'. */
export function templateDescription(t: { slots: TemplateSlot[]; teacherIds: string[] }): string {
  const times = t.slots.length
    ? `${slotSummary(t.slots[0])}${t.slots.length > 1 ? ` +${t.slots.length - 1} more` : ''}`
    : 'No times';
  const people = `${t.teacherIds.length} ${t.teacherIds.length === 1 ? 'person' : 'people'}`;
  return [times, people].join(' · ');
}

/**
 * The name saved with a template. The server still requires one (and older
 * app versions show it), but the app no longer asks for or shows it, so it is
 * made from the dates and first time: 'Sep 8 – Dec 18, 2026 · Mon–Thu 4:00
 * PM–6:00 PM'. The same template always gets the same name, so a
 * retried save is still recognised as the same change.
 */
export function templateName(t: { startDate: string; endDate: string; slots: TemplateSlot[] }): string {
  const dates = dateRangeLabel(t.startDate, t.endDate, Number.NaN);
  const first = t.slots[0];
  const name = first ? `${dates} · ${formatDays(first.days)} ${formatTime(first.start)}–${formatTime(first.end)}` : dates;
  return name.length > TEMPLATE_NAME_MAX ? `${name.slice(0, TEMPLATE_NAME_MAX - 1)}…` : name;
}

/** Whether the editor's draft differs from where it started, so there is something to save. */
export function templateChanged(
  a: { startDate: string; endDate: string; slots: TemplateSlot[]; teacherIds: string[] },
  b: { startDate: string; endDate: string; slots: TemplateSlot[]; teacherIds: string[] }
): boolean {
  const key = (t: typeof a) =>
    JSON.stringify([
      t.startDate,
      t.endDate,
      t.slots.map((s) => [s.id, [...s.days].sort((x, y) => x - y), s.start, s.end, s.locationId]),
      [...t.teacherIds].sort(),
    ]);
  return key(a) !== key(b);
}

/**
 * Why the editor's template can't be saved yet, or null. The same checks and
 * messages as the server's parseTemplate, so the admin sees them straight away
 * (the name is left out: templateName always makes a valid one).
 */
export function templateProblem(
  t: { startDate: string; endDate: string; slots: TemplateSlot[]; teacherIds: string[] },
  locationIds: string[]
): string | null {
  if (t.endDate < t.startDate) return 'The end date must be on or after the start date.';
  if (differenceInCalendarDays(parseISO(t.endDate), parseISO(t.startDate)) >= SPAN_DAYS_MAX) {
    return 'A schedule can cover at most a year.';
  }
  if (t.slots.length === 0) return 'Add at least one time.';
  if (t.slots.length > TEMPLATE_SLOTS_MAX) return `A schedule can have at most ${TEMPLATE_SLOTS_MAX} times.`;
  for (const s of t.slots) {
    if (s.days.length === 0) return 'Choose the days for each time.';
    if (s.start >= s.end) return 'Each time must end after it starts.';
    if (!locationIds.includes(s.locationId)) return 'Choose a location for each time.';
  }
  for (let i = 0; i < t.slots.length; i++) {
    for (let j = i + 1; j < t.slots.length; j++) {
      const [a, b] = [t.slots[i], t.slots[j]];
      const shared = a.days.find((d) => b.days.includes(d));
      if (shared && a.start < b.end && b.start < a.end) return `Two times overlap on ${WEEKDAY_NAMES[shared - 1]}.`;
    }
  }
  if (t.teacherIds.length === 0) return 'Choose at least one person.';
  return null;
}

/**
 * The end date after the start moves: kept if still after it, otherwise moved
 * so the schedule keeps its length (at most a year).
 */
export function endAfterStartMoves(oldStart: string, newStart: string, end: string): string {
  if (end >= newStart) return end;
  const length = Math.min(Math.max(0, differenceInCalendarDays(parseISO(end), parseISO(oldStart))), SPAN_DAYS_MAX - 1);
  return format(addDays(parseISO(newStart), length), 'yyyy-MM-dd');
}

/** Whether a template's last day is before `today` ('yyyy-MM-dd'). */
export const hasEnded = (t: { endDate: string }, today: string) => t.endDate < today;

const shifts = (n: number) => `${n} shift${n === 1 ? '' : 's'}`;

/**
 * One sentence on what applying (or deleting) changes: 'Adds 168 shifts and
 * updates 4 for 12 people.' or 'No one's shifts change.'
 */
export function changeSummary(r: TemplateApplyResult): string {
  const people = new Set(r.teachers.filter((t) => t.added + t.updated + t.removed > 0).map((t) => t.teacherId)).size;
  const parts = [
    r.added ? `adds ${shifts(r.added)}` : '',
    r.updated ? `updates ${shifts(r.updated)}` : '',
    r.removed ? `removes ${shifts(r.removed)}` : '',
  ].filter(Boolean);
  if (parts.length === 0) return 'No one’s shifts change.';
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${sentence[0].toUpperCase()}${sentence.slice(1)} for ${people} ${people === 1 ? 'person' : 'people'}.`;
}

const SKIP_REASONS: { reason: 'overlap' | 'full' | 'past'; why: string }[] = [
  { reason: 'overlap', why: 'overlap another shift' },
  { reason: 'full', why: 'week already full' },
  { reason: 'past', why: 'new time already passed, so today keeps its old time' },
];

/**
 * The template shifts that won't be written, by person, for the preview:
 * 'Sara M: Tue Nov 17, Wed Nov 18 (overlap another shift)'. Several reasons
 * are separated by semicolons. Empty when none.
 */
export function skippedLines(r: TemplateApplyResult, nameOf: (uid: string) => string): string[] {
  return r.teachers
    .filter((t) => t.skippedCount > 0)
    .map((t) => {
      const groups = SKIP_REASONS.map(({ reason, why }) => {
        const days = t.skipped.filter((s) => s.reason === reason).map((s) => format(parseISO(s.date), 'EEE MMM d'));
        return days.length ? `${days.join(', ')} (${why})` : '';
      }).filter(Boolean);
      const more = t.skippedCount - t.skipped.length;
      return `${nameOf(t.teacherId)}: ${groups.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
    });
}
