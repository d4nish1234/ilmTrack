/**
 * The shift sheet's logic: one sheet for what was planned (Scheduled) and
 * what happened (Worked), saved together. Pure, so it is unit-tested
 * (tests/shiftSheet.test.ts).
 */
import type { Shift } from '../types';
import type { TimesheetRow } from './timesheet';
import { formatDuration } from './timekeeping';

export interface WorkedTimes {
  /** 'HH:mm', org time */
  start: string;
  end: string;
}

export type StatusTone = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

/**
 * The pill next to the date: what happened, at a glance. Null for a new
 * shift, which has no history yet.
 */
export function shiftStatus(row: TimesheetRow | null): { label: string; tone: StatusTone } | null {
  if (!row) return null;
  switch (row.status) {
    case 'upcoming':
      return { label: 'Upcoming', tone: 'neutral' };
    case 'late':
      return { label: 'Not started yet', tone: 'warning' };
    case 'running':
      return { label: 'On shift now', tone: 'primary' };
    case 'paused':
      return { label: 'On a break', tone: 'warning' };
    case 'worked':
      return { label: `Worked ${formatDuration(row.workedMinutes)}`, tone: 'success' };
    case 'not-started':
      return { label: 'Not started', tone: 'danger' };
  }
}

/**
 * Whether the shift has started or is over. Then the sheet leads with
 * Worked, the part an admin is there for, and folds Scheduled into one line;
 * otherwise only Scheduled matters.
 */
export function hasHappened(row: TimesheetRow | null): boolean {
  return !!row && (row.status === 'running' || row.status === 'paused' || row.status === 'worked' || row.status === 'not-started');
}

/** Whether the worked hours can be changed now: only once the shift is over. */
export function canEditWorked(row: TimesheetRow | null): boolean {
  return !!row && (row.status === 'worked' || row.status === 'not-started');
}

/**
 * Where the worked times start: what was recorded, kept within the shift as
 * it is now (it may have been shortened since), so an unchanged save is
 * accepted. For a shift never started, the scheduled times. 'HH:mm' strings
 * compare in time order.
 */
export function initialWorked(row: TimesheetRow): WorkedTimes {
  const start = row.workedFrom && row.workedFrom > row.start ? row.workedFrom : row.start;
  const end = row.workedTo && row.workedTo < row.end ? row.workedTo : row.end;
  return start < end ? { start, end } : { start: row.start, end: row.end };
}

/** Whether a shift's plan (times and location) differs. */
export function scheduleChanged(a: Shift, b: Shift): boolean {
  return a.start !== b.start || a.end !== b.end || a.locationId !== b.locationId;
}

export const sameWorked = (a: WorkedTimes, b: WorkedTimes) => a.start === b.start && a.end === b.end;

/**
 * Why the worked hours can't be saved, or null. The same rules as the
 * server's correctTimeEntry: end after start, within the shift (as it will be
 * once this save has changed it), and a reason.
 */
export function workedProblem(worked: WorkedTimes, bounds: WorkedTimes, reason: string): string | null {
  if (worked.start >= worked.end) return 'The worked end must be after the start.';
  if (worked.start < bounds.start || worked.end > bounds.end) {
    return 'Worked time must be within the scheduled time. To pay for longer, change the scheduled time too.';
  }
  if (!reason.trim()) return 'Add a reason for changing the hours.';
  return null;
}

/**
 * A warning, not a block, when the plan is changed so that hours worked fall
 * outside it: the timesheet would then show more worked than scheduled.
 * `worked` is the hours as this save will leave them (edited, or as
 * recorded); null when nothing was worked. Null when they still fit.
 */
export function workedOutsidePlan(plan: WorkedTimes, worked: WorkedTimes | null): string | null {
  if (!worked || (worked.start >= plan.start && worked.end <= plan.end)) return null;
  return 'Some of the hours worked fall outside the new scheduled time, so the timesheet will show more worked than scheduled. Change the worked hours too if they should match.';
}
