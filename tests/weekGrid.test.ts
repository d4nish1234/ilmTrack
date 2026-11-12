import { describe, expect, it } from 'vitest';
import { ROW_MIN_HEIGHT, cellTone, gridCells, gridDates, rowHeight, rowLines, shortRange, shortTime, weekRangeLabel } from '../src/utils/weekGrid';
import type { TimesheetRow } from '../src/utils/timesheet';

const row = (date: string, start: string, end: string, over: Partial<TimesheetRow> = {}): TimesheetRow => ({
  shiftId: `${date}-${start}`,
  date,
  start,
  end,
  locationName: 'Main',
  removed: false,
  entry: null,
  status: 'upcoming',
  scheduledMinutes: 0,
  workedMinutes: 0,
  workedFrom: null,
  workedTo: null,
  ...over,
});

const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];

describe('short times', () => {
  it('drops :00 and AM/PM to fit a cell', () => {
    expect(shortTime('16:00')).toBe('4');
    expect(shortTime('16:30')).toBe('4:30');
    expect(shortTime('00:05')).toBe('12:05');
    expect(shortTime('12:00')).toBe('12');
    expect(shortRange('09:00', '13:00')).toBe('9–1');
    expect(shortRange('16:30', '18:00')).toBe('4:30–6');
  });
});

describe('gridCells', () => {
  it('gives each date its shifts in time order, showing two and counting the rest', () => {
    const rows = [
      row('2026-11-09', '16:00', '18:00'),
      row('2026-11-09', '09:00', '11:00'),
      row('2026-11-09', '12:00', '13:00'),
      row('2026-11-10', '16:00', '18:00'),
    ];
    const [mon, tue, wed] = gridCells(rows, WEEK.slice(0, 3));
    expect(mon.shown.map((r) => r.start)).toEqual(['09:00', '12:00']);
    expect(mon.more).toBe(1);
    expect(mon.rows).toHaveLength(3);
    expect(tue).toMatchObject({ more: 0 });
    expect(wed.rows).toEqual([]);
    expect(rowLines([mon, tue, wed])).toBe(2);
    expect(rowLines(gridCells([], WEEK))).toBe(1);
    // Never below a comfortable tap target; taller for two times.
    expect(rowHeight(gridCells([], WEEK))).toBe(ROW_MIN_HEIGHT);
    expect(rowHeight([mon, tue, wed])).toBeGreaterThan(ROW_MIN_HEIGHT);
  });
});

describe('gridDates', () => {
  it('always shows Monday to Friday, and the weekend only when used', () => {
    expect(gridDates(WEEK, [])).toEqual(WEEK.slice(0, 5));
    expect(gridDates(WEEK, [row('2026-11-15', '10:00', '12:00')])).toEqual([...WEEK.slice(0, 5), '2026-11-15']);
  });
});

describe('cellTone', () => {
  it('reads each status at a glance', () => {
    expect(cellTone('worked')).toBe('worked');
    expect(cellTone('running')).toBe('live');
    expect(cellTone('paused')).toBe('live');
    expect(cellTone('not-started')).toBe('missed');
    expect(cellTone('late')).toBe('late');
    expect(cellTone('upcoming')).toBe('upcoming');
  });
});

describe('weekRangeLabel', () => {
  it('names the week compactly, with the year only when it is not this one', () => {
    expect(weekRangeLabel('2026-11-09', 2026)).toBe('Nov 9 – 15');
    expect(weekRangeLabel('2026-11-30', 2026)).toBe('Nov 30 – Dec 6');
    expect(weekRangeLabel('2026-12-28', 2026)).toBe('Dec 28 – Jan 3, 2027');
    expect(weekRangeLabel('2027-03-01', 2026)).toBe('Mar 1 – 7, 2027');
  });
});
