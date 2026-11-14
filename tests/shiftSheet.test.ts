import { describe, it, expect } from 'vitest';
import {
  canEditWorked,
  hasHappened,
  initialWorked,
  sameWorked,
  scheduleChanged,
  shiftStatus,
  workedOutsidePlan,
  workedProblem,
} from '../src/utils/shiftSheet';
import type { TimesheetRow } from '../src/utils/timesheet';
import type { Shift } from '../src/types';

const row = (over: Partial<TimesheetRow> = {}): TimesheetRow => ({
  shiftId: 's1',
  date: '2026-11-12',
  start: '16:00',
  end: '18:00',
  locationName: 'Main campus',
  removed: false,
  entry: null,
  status: 'worked',
  scheduledMinutes: 120,
  workedMinutes: 110,
  workedFrom: '16:05',
  workedTo: '17:55',
  ...over,
});
const shift = (over: Partial<Shift> = {}): Shift => ({
  id: 's1',
  date: '2026-11-12',
  start: '16:00',
  end: '18:00',
  locationId: 'l1',
  ...over,
});

describe('shiftStatus', () => {
  it('says what happened, with a tone', () => {
    expect(shiftStatus(null)).toBeNull();
    expect(shiftStatus(row())).toEqual({ label: 'Worked 1h 50m', tone: 'success' });
    expect(shiftStatus(row({ status: 'not-started' }))).toEqual({ label: 'Not started', tone: 'danger' });
    expect(shiftStatus(row({ status: 'upcoming' }))?.label).toBe('Upcoming');
    expect(shiftStatus(row({ status: 'late' }))?.label).toBe('Not started yet');
    expect(shiftStatus(row({ status: 'running' }))?.label).toBe('On shift now');
    expect(shiftStatus(row({ status: 'paused' }))?.label).toBe('On a break');
  });
});

describe('hasHappened and canEditWorked', () => {
  it('leads with Worked once a shift has started or is over', () => {
    expect(hasHappened(null)).toBe(false);
    expect(hasHappened(row({ status: 'upcoming' }))).toBe(false);
    expect(hasHappened(row({ status: 'late' }))).toBe(false);
    for (const status of ['running', 'paused', 'worked', 'not-started'] as const) {
      expect(hasHappened(row({ status }))).toBe(true);
    }
  });

  it('lets hours be changed only once the shift is over', () => {
    expect(canEditWorked(row())).toBe(true);
    expect(canEditWorked(row({ status: 'not-started' }))).toBe(true);
    expect(canEditWorked(row({ status: 'running' }))).toBe(false);
    expect(canEditWorked(row({ status: 'late' }))).toBe(false);
    expect(canEditWorked(null)).toBe(false);
  });
});

describe('initialWorked', () => {
  it('starts from what was recorded', () => {
    expect(initialWorked(row())).toEqual({ start: '16:05', end: '17:55' });
  });

  it('keeps it within a shift shortened since', () => {
    expect(initialWorked(row({ end: '17:30' }))).toEqual({ start: '16:05', end: '17:30' });
  });

  it('starts from the scheduled times for a shift never started', () => {
    expect(initialWorked(row({ status: 'not-started', workedFrom: null, workedTo: null }))).toEqual({
      start: '16:00',
      end: '18:00',
    });
  });
});

describe('changes', () => {
  it('notices a changed plan, not the same one', () => {
    expect(scheduleChanged(shift(), shift())).toBe(false);
    expect(scheduleChanged(shift(), shift({ end: '18:30' }))).toBe(true);
    expect(scheduleChanged(shift(), shift({ locationId: 'l2' }))).toBe(true);
  });

  it('compares worked times', () => {
    expect(sameWorked({ start: '16:00', end: '18:00' }, { start: '16:00', end: '18:00' })).toBe(true);
    expect(sameWorked({ start: '16:00', end: '18:00' }, { start: '16:00', end: '17:55' })).toBe(false);
  });
});

describe('workedProblem (the server’s rules)', () => {
  const bounds = { start: '16:00', end: '18:00' };

  it('accepts hours within the shift with a reason', () => {
    expect(workedProblem({ start: '16:05', end: '18:00' }, bounds, 'Forgot to end')).toBeNull();
  });

  it('needs the end after the start', () => {
    expect(workedProblem({ start: '17:00', end: '17:00' }, bounds, 'x')).toMatch(/after the start/);
  });

  it('needs the hours within the shift as it will be saved', () => {
    expect(workedProblem({ start: '16:00', end: '18:30' }, bounds, 'x')).toMatch(/within the scheduled time/);
    // Extending the plan in the same save makes it fine.
    expect(workedProblem({ start: '16:00', end: '18:30' }, { start: '16:00', end: '18:30' }, 'x')).toBeNull();
  });

  it('needs a reason', () => {
    expect(workedProblem({ start: '16:05', end: '17:55' }, bounds, '  ')).toMatch(/reason/);
  });
});

describe('workedOutsidePlan', () => {
  const plan = { start: '16:00', end: '17:00' };

  it('warns when hours worked fall outside the new plan', () => {
    expect(workedOutsidePlan(plan, { start: '16:05', end: '17:55' })).toMatch(/outside the new scheduled time/);
    expect(workedOutsidePlan(plan, { start: '15:30', end: '16:30' })).toMatch(/outside/);
  });

  it('is quiet when they fit, or nothing was worked', () => {
    expect(workedOutsidePlan(plan, { start: '16:00', end: '17:00' })).toBeNull();
    expect(workedOutsidePlan(plan, null)).toBeNull();
  });
});
