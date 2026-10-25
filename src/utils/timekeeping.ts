/**
 * Pure helpers for shifts and weeks. No Firebase, so they are unit-tested
 * directly (tests/timekeeping.test.ts).
 *
 * Dates are 'yyyy-MM-dd' and times 'HH:mm' wall-clock strings in the
 * organization's timezone. They are parsed as local dates only to do calendar
 * arithmetic, then formatted straight back, so the device's own timezone never
 * leaks into what is stored.
 */
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import type { Shift } from '../types';

/** How close a teacher must be to a location, in metres. */
export const RADIUS_OPTIONS_M = [100, 150, 250] as const;

/** Shift times move in steps of this many minutes on every platform. */
export const MINUTE_STEP = 5;

/**
 * A problem worth showing the admin as written ("This overlaps the 4:30 PM
 * shift"). Anything else — offline, permission denied — gets a generic message,
 * so raw Firebase errors never reach the screen.
 */
export class TimekeepingError extends Error {}

/** The message to show for an error from a timekeeping action. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TimekeepingError ? err.message : fallback;
}

export const DEFAULT_RADIUS_M = 150;

const DATE_FORMAT = 'yyyy-MM-dd';

export function scheduleId(orgId: string, teacherId: string, weekStart: string): string {
  return `${orgId}_${teacherId}_${weekStart}`;
}

/** The Monday of the week containing this date, as 'yyyy-MM-dd'. */
export function weekStartOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), DATE_FORMAT);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return format(addWeeks(parseISO(weekStart), weeks), DATE_FORMAT);
}

/** The seven dates of a week, Monday first. */
export function weekDates(weekStart: string): string[] {
  const monday = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), DATE_FORMAT));
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Round to the nearest step, staying within the same day. */
export function snapToStep(minutes: number, step = MINUTE_STEP): number {
  return Math.min(Math.round(minutes / step) * step, 24 * 60 - step);
}

export function shiftMinutes(shift: Pick<Shift, 'start' | 'end'>): number {
  return Math.max(0, toMinutes(shift.end) - toMinutes(shift.start));
}

export function totalMinutes(shifts: Pick<Shift, 'start' | 'end'>[]): number {
  return shifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
}

/** '6h', '6h 30m', '45m', '0m' */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** '16:00' → '4:00 PM' */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** '3 shifts · 6h', '1 shift · 45m', or 'No shifts' */
export function weekSummary(shifts: Pick<Shift, 'start' | 'end'>[]): string {
  if (shifts.length === 0) return 'No shifts';
  const count = `${shifts.length} shift${shifts.length === 1 ? '' : 's'}`;
  return `${count} · ${formatDuration(totalMinutes(shifts))}`;
}

/** Shifts sorted by date, then start time. */
export function sortShifts<T extends Pick<Shift, 'date' | 'start'>>(shifts: T[]): T[] {
  return [...shifts].sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)
  );
}

/**
 * Why this shift cannot be saved, or null if it can. Checked against the
 * teacher's other shifts that week, ignoring the shift being edited.
 */
export function shiftProblem(shift: Shift, others: Shift[]): string | null {
  if (toMinutes(shift.end) <= toMinutes(shift.start)) {
    return 'The shift must end after it starts.';
  }
  const clash = others.find(
    (o) =>
      o.id !== shift.id &&
      o.date === shift.date &&
      toMinutes(o.start) < toMinutes(shift.end) &&
      toMinutes(shift.start) < toMinutes(o.end)
  );
  if (clash) {
    return `This overlaps the ${formatTime(clash.start)}–${formatTime(clash.end)} shift.`;
  }
  return null;
}

/**
 * This week's shifts moved to another week, same weekday and times. Ids are
 * regenerated so the copy and the original never share one.
 */
export function copyShiftsToWeek(
  shifts: Shift[],
  fromWeekStart: string,
  toWeekStart: string,
  newId: () => string
): Shift[] {
  const days = Math.round(
    (parseISO(toWeekStart).getTime() - parseISO(fromWeekStart).getTime()) / 86_400_000
  );
  return sortShifts(
    shifts.map((s) => ({
      ...s,
      id: newId(),
      date: format(addDays(parseISO(s.date), days), DATE_FORMAT),
    }))
  );
}
