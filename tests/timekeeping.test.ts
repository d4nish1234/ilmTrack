import { describe, it, expect } from 'vitest';
import {
  TimekeepingError,
  copyShiftsToWeek,
  currentWeekStart,
  errorMessage,
  formatDuration,
  formatTime,
  scheduleId,
  shiftProblem,
  shiftWeek,
  todayIn,
  snapToStep,
  totalMinutes,
  weekDates,
  weekStartOf,
  weekSummary,
} from '../src/utils/timekeeping';
import type { Shift } from '../src/types';

const mkShift = (overrides: Partial<Shift>): Shift => ({
  id: 's1',
  date: '2026-10-13',
  start: '16:00',
  end: '17:00',
  locationId: 'loc1',
  ...overrides,
});

describe('weeks', () => {
  it('starts on Monday', () => {
    expect(weekStartOf(new Date(2026, 9, 12))).toBe('2026-10-12'); // Monday
    expect(weekStartOf(new Date(2026, 9, 18))).toBe('2026-10-12'); // Sunday
    expect(weekStartOf(new Date(2026, 9, 19))).toBe('2026-10-19');
  });

  it('lists seven dates, across a month end', () => {
    expect(weekDates('2026-10-26')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
      '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
  });

  it('moves by whole weeks', () => {
    expect(shiftWeek('2026-10-12', 1)).toBe('2026-10-19');
    expect(shiftWeek('2026-10-12', -1)).toBe('2026-10-05');
  });

  it('builds the schedule id the rules check', () => {
    expect(scheduleId('org1', 'uid1', '2026-10-12')).toBe('org1_uid1_2026-10-12');
  });
});

describe('formatting', () => {
  it('formats times as 12-hour', () => {
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('09:30')).toBe('9:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('16:00')).toBe('4:00 PM');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(360)).toBe('6h');
    expect(formatDuration(390)).toBe('6h 30m');
  });

  it('summarises a week', () => {
    expect(weekSummary([])).toBe('No shifts');
    expect(weekSummary([mkShift({})])).toBe('1 shift · 1h');
    expect(
      weekSummary([mkShift({}), mkShift({ id: 's2', start: '09:00', end: '12:30' })])
    ).toBe('2 shifts · 4h 30m');
    expect(totalMinutes([mkShift({ start: '16:00', end: '16:45' })])).toBe(45);
  });
});

describe('shiftProblem', () => {
  it('accepts a valid shift', () => {
    expect(shiftProblem(mkShift({}), [])).toBeNull();
  });

  it('rejects one that ends before or when it starts', () => {
    expect(shiftProblem(mkShift({ end: '16:00' }), [])).toMatch(/end after/);
    expect(shiftProblem(mkShift({ end: '15:00' }), [])).toMatch(/end after/);
  });

  it('rejects an overlap on the same day', () => {
    const other = mkShift({ id: 'other', start: '16:30', end: '18:00' });
    expect(shiftProblem(mkShift({}), [other])).toMatch(/overlaps the 4:30 PM–6:00 PM/);
  });

  it('allows back-to-back shifts and the same times on another day', () => {
    expect(shiftProblem(mkShift({}), [mkShift({ id: 'a', start: '17:00', end: '18:00' })])).toBeNull();
    expect(shiftProblem(mkShift({}), [mkShift({ id: 'b', date: '2026-10-14' })])).toBeNull();
  });

  it('ignores the shift being edited', () => {
    expect(shiftProblem(mkShift({ end: '18:00' }), [mkShift({})])).toBeNull();
  });
});

describe('copyShiftsToWeek', () => {
  it('keeps weekday and times, with new ids', () => {
    let n = 0;
    const copied = copyShiftsToWeek(
      [mkShift({ id: 'a', date: '2026-10-18' }), mkShift({ id: 'b', date: '2026-10-13' })],
      '2026-10-12',
      '2026-10-19',
      () => `new${++n}`
    );
    expect(copied.map((s) => s.date)).toEqual(['2026-10-20', '2026-10-25']);
    expect(copied.every((s) => s.start === '16:00' && s.end === '17:00')).toBe(true);
    expect(copied.map((s) => s.id).sort()).toEqual(['new1', 'new2']);
  });

  it('crosses a daylight-saving change without moving a day', () => {
    // North America falls back on Sunday 2026-11-01.
    const copied = copyShiftsToWeek(
      [mkShift({ date: '2026-10-27' })],
      '2026-10-26',
      '2026-11-02',
      () => 'x'
    );
    expect(copied[0].date).toBe('2026-11-03');
    expect(copied[0].start).toBe('16:00');
  });

  it('copies an empty week as empty', () => {
    expect(copyShiftsToWeek([], '2026-10-12', '2026-10-19', () => 'x')).toEqual([]);
  });
});

describe('snapToStep', () => {
  it('rounds to the nearest 5 minutes', () => {
    expect(snapToStep(16 * 60 + 2)).toBe(16 * 60);
    expect(snapToStep(16 * 60 + 3)).toBe(16 * 60 + 5);
    expect(snapToStep(16 * 60 + 58)).toBe(17 * 60);
  });

  it('never rounds past the end of the day', () => {
    expect(snapToStep(23 * 60 + 58)).toBe(23 * 60 + 55);
  });
});

describe('errorMessage', () => {
  it('shows our own messages and hides everything else', () => {
    expect(errorMessage(new TimekeepingError('This overlaps.'), 'fallback')).toBe('This overlaps.');
    expect(errorMessage(new Error('FirebaseError: [code=permission-denied]'), 'fallback')).toBe('fallback');
    expect(errorMessage('oops', 'fallback')).toBe('fallback');
  });
});

describe('current week in the organization timezone', () => {
  // 2026-10-19 02:00 UTC: still Sunday the 18th in Toronto, already Monday
  // the 19th in London. The two weeks differ.
  const now = new Date(Date.UTC(2026, 9, 19, 2, 0));

  it("uses the organization's date, not the device's", () => {
    expect(todayIn('America/Toronto', now)).toBe('2026-10-18');
    expect(todayIn('Europe/London', now)).toBe('2026-10-19');
    expect(currentWeekStart('America/Toronto', now)).toBe('2026-10-12');
    expect(currentWeekStart('Europe/London', now)).toBe('2026-10-19');
  });

  it("falls back to the device's date when the zone is missing or unknown", () => {
    const deviceWeek = weekStartOf(now);
    expect(currentWeekStart(null, now)).toBe(deviceWeek);
    expect(currentWeekStart(undefined, now)).toBe(deviceWeek);
    expect(currentWeekStart('Not/AZone', now)).toBe(deviceWeek);
  });
});
