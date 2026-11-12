import { describe, expect, it } from 'vitest';
import {
  coverageOf,
  coversAll,
  isoWeekday,
  mergeCoverage,
  sameTemplate,
  isRealDate,
  mondayOfDate,
  parseTemplate,
  reconcileWeek,
  shiftsForWeek,
  templateShiftId,
  weeksBetween,
  type StoredShift,
  type TemplateData,
} from '../src/scheduleTemplatesCore';

const LOC = ['loc1', 'loc2'];
const slot = (over: object = {}) => ({ id: 'a', days: [1, 2, 3, 4], start: '16:00', end: '18:00', locationId: 'loc1', ...over });
const input = (over: object = {}) => ({
  name: 'Term 1',
  startDate: '2026-09-08',
  endDate: '2026-12-18',
  slots: [slot()],
  teacherIds: ['t1', 't2'],
  ...over,
});
const message = (value: unknown) => {
  const r = parseTemplate(value, LOC);
  return r.ok ? null : r.message;
};

describe('dates', () => {
  it('knows weekdays, Mondays and real dates', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // Monday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
    expect(mondayOfDate('2026-11-15')).toBe('2026-11-09');
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2028-02-29')).toBe(true);
  });

  it('lists the weeks a range touches', () => {
    expect(weeksBetween('2026-11-11', '2026-11-24')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
  });
});

describe('parseTemplate', () => {
  it('accepts a valid template, trimming the name and sorting days', () => {
    const r = parseTemplate(input({ name: '  Term 1 ', slots: [slot({ days: [4, 1, 2] })] }), LOC);
    expect(r).toMatchObject({ ok: true, template: { name: 'Term 1', slots: [{ days: [1, 2, 4] }] } });
  });

  it('needs at least one person', () => {
    expect(message(input({ teacherIds: [] }))).toBe('Choose at least one person.');
  });

  it('refuses a missing name, bad dates, or more than a year', () => {
    expect(message(input({ name: ' ' }))).toBe('Give the schedule a name.');
    expect(message(input({ startDate: '2026-13-01' }))).toBe('Choose a start and end date.');
    expect(message(input({ endDate: '2026-09-01' }))).toBe('The end date must be on or after the start date.');
    expect(message(input({ endDate: '2027-09-09' }))).toBe('A schedule can cover at most a year.');
    expect(message(input({ endDate: '2027-09-08' }))).toBeNull(); // the same date a year on
  });

  it('refuses times without days, backwards times or an unknown location', () => {
    expect(message(input({ slots: [] }))).toBe('Add at least one time.');
    expect(message(input({ slots: [slot({ days: [] })] }))).toBe('Choose the days for each time.');
    expect(message(input({ slots: [slot({ days: [0] })] }))).toBe('Choose the days for each time.');
    expect(message(input({ slots: [slot({ start: '18:00', end: '16:00' })] }))).toBe('Each time must end after it starts.');
    expect(message(input({ slots: [slot({ locationId: 'gone' })] }))).toBe('Choose a location for each time.');
  });

  it('refuses two times that overlap on a shared day, but not on different days', () => {
    const overlapping = [slot(), slot({ id: 'b', days: [4, 6], start: '17:00', end: '19:00' })];
    expect(message(input({ slots: overlapping }))).toBe('Two times overlap on Thursday.');
    const apart = [slot(), slot({ id: 'b', days: [6], start: '17:00', end: '19:00' })];
    expect(message(input({ slots: apart }))).toBeNull();
    const backToBack = [slot(), slot({ id: 'b', start: '18:00', end: '19:00' })];
    expect(message(input({ slots: backToBack }))).toBeNull();
  });

  it('refuses duplicate or malformed ids', () => {
    expect(message(input({ slots: [slot(), slot({ days: [6] })] }))).toMatch(/not valid/);
    expect(message(input({ teacherIds: ['t1', 'bad/id'] }))).toBe('One of the teachers is not valid.');
  });
});

describe('shiftsForWeek', () => {
  const template: TemplateData = {
    name: 'Term 1',
    startDate: '2026-11-11', // a Wednesday
    endDate: '2026-12-18',
    slots: [slot(), slot({ id: 'b', days: [6], start: '09:00', end: '12:00', locationId: 'loc2' })],
    teacherIds: ['t1'],
  };

  it("writes the template's days within its dates, with stable ids", () => {
    const shifts = shiftsForWeek(template, 'tpl', '2026-11-09');
    expect(shifts.map((s) => `${s.date} ${s.start}`)).toEqual([
      '2026-11-11 16:00', // Mon and Tue are before the start date
      '2026-11-12 16:00',
      '2026-11-14 09:00',
    ]);
    expect(shifts[0]).toEqual({
      id: templateShiftId('tpl', 'a', '2026-11-11'),
      date: '2026-11-11', start: '16:00', end: '18:00', locationId: 'loc1', templateId: 'tpl',
    });
  });

  it('stops at the end date', () => {
    expect(shiftsForWeek(template, 'tpl', '2026-12-14').map((s) => s.date)).toEqual([
      '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17',
    ]);
  });
});

describe('reconcileWeek', () => {
  const tpl = (date: string, start = '16:00', end = '18:00', id = templateShiftId('tpl', 'a', date)): StoredShift =>
    ({ id, date, start, end, locationId: 'loc1', templateId: 'tpl' });
  const manual = (id: string, date: string, start: string, end: string): StoredShift => ({ id, date, start, end, locationId: 'loc1' });
  const run = (current: StoredShift[], desired: StoredShift[], extra: Partial<Parameters<typeof reconcileWeek>[0]> = {}) =>
    reconcileWeek({ current, desired, templateId: 'tpl', dayOnly: [], isFixed: () => false, canCreate: () => true, ...extra });

  it('adds the template to an empty week', () => {
    const r = run([], [tpl('2026-11-10'), tpl('2026-11-09')]);
    expect(r.added).toHaveLength(2);
    expect(r.shifts.map((s) => s.date)).toEqual(['2026-11-09', '2026-11-10']); // sorted
    expect(r.changed).toBe(true);
  });

  it('changes nothing when applied twice', () => {
    const desired = [tpl('2026-11-09')];
    const first = run([], desired);
    const second = run(first.shifts, desired);
    expect(second.changed).toBe(false);
    expect(second.shifts).toEqual(first.shifts);
  });

  it("updates its own shifts in place, keeping their ids so hours stay linked", () => {
    const r = run([tpl('2026-11-09')], [tpl('2026-11-09', '15:00', '17:00')]);
    expect(r.updated).toHaveLength(1);
    expect(r.added).toHaveLength(0);
    expect(r.shifts[0]).toMatchObject({ id: templateShiftId('tpl', 'a', '2026-11-09'), start: '15:00' });
  });

  it("removes its shifts that are no longer wanted, but never anyone else's", () => {
    const other = { ...tpl('2026-11-10'), id: 'x', templateId: 'other' };
    const hand = manual('m1', '2026-11-11', '09:00', '10:00');
    const r = run([tpl('2026-11-09'), other, hand], []);
    expect(r.removed.map((s) => s.id)).toEqual([templateShiftId('tpl', 'a', '2026-11-09')]);
    expect(r.shifts).toEqual([other, hand]);
  });

  it('never touches a shift that has started or is about to', () => {
    const started = tpl('2026-11-09');
    const r = run([started], [tpl('2026-11-09', '15:00', '17:00')], { isFixed: (s) => s.date === '2026-11-09' });
    expect(r.shifts).toEqual([started]);
    expect(r.changed).toBe(false);
    expect(run([started], [], { isFixed: () => true }).removed).toEqual([]);
  });

  it("doesn't write into the past", () => {
    const r = run([], [tpl('2026-11-09'), tpl('2026-11-10')], { canCreate: (s) => s.date >= '2026-11-10' });
    expect(r.shifts.map((s) => s.date)).toEqual(['2026-11-10']);
  });

  it('leaves a day edited by hand alone (its templateId is gone, its id the same)', () => {
    const edited = { ...manual(templateShiftId('tpl', 'a', '2026-11-09'), '2026-11-09', '17:00', '19:00') };
    const r = run([edited], [tpl('2026-11-09')]);
    expect(r.shifts).toEqual([edited]);
    expect(r.changed).toBe(false);
  });

  it('keeps a day deleted by hand deleted', () => {
    const id = templateShiftId('tpl', 'a', '2026-11-09');
    const r = run([], [tpl('2026-11-09'), tpl('2026-11-10')], { dayOnly: [id] });
    expect(r.shifts.map((s) => s.date)).toEqual(['2026-11-10']);
  });

  it('skips a shift that would overlap another, and reports it', () => {
    const hand = manual('m1', '2026-11-09', '17:00', '19:00');
    const r = run([hand], [tpl('2026-11-09'), tpl('2026-11-10')]);
    expect(r.shifts).toEqual([hand, tpl('2026-11-10')]);
    expect(r.skipped).toEqual([{ shift: tpl('2026-11-09'), reason: 'overlap' }]);
  });

  it("doesn't count back-to-back shifts as overlapping", () => {
    const hand = manual('m1', '2026-11-09', '14:00', '16:00');
    expect(run([hand], [tpl('2026-11-09')]).skipped).toEqual([]);
  });

  it("keeps today's shift at its old time when its new time has already passed", () => {
    const old = tpl('2026-11-09', '16:00', '18:00');
    const moved = tpl('2026-11-09', '10:00', '11:00');
    const r = run([old], [moved], { canCreate: (s) => s.start > '12:00' });
    expect(r.shifts).toEqual([old]);
    expect(r.changed).toBe(false);
    expect(r.skipped).toEqual([{ shift: moved, reason: 'past' }]);
  });

  it('skips shifts once the week is full', () => {
    const full = Array.from({ length: 50 }, (_, i) =>
      manual(`m${i}`, '2026-11-1' + (i % 7), `0${i % 10}:00`.slice(-5), `0${i % 10}:30`.slice(-5))
    );
    const r = run(full, [tpl('2026-11-20', '20:00', '21:00')]);
    expect(r.skipped[0].reason).toBe('full');
  });
});

describe('coverage', () => {
  const t = (teacherIds: string[], startDate: string, endDate: string) => ({ teacherIds, startDate, endDate });

  it('merges people and widens the dates', () => {
    expect(mergeCoverage(t(['a'], '2026-09-08', '2026-10-01'), t(['b', 'a'], '2026-09-15', '2026-12-18'))).toEqual(
      t(['a', 'b'], '2026-09-08', '2026-12-18')
    );
    expect(mergeCoverage(null, t(['a'], '2026-09-08', '2026-10-01'))).toEqual(t(['a'], '2026-09-08', '2026-10-01'));
    expect(mergeCoverage(null, undefined)).toBeNull();
  });

  it('knows when a new version covers everything the old one did', () => {
    const next = coverageOf(input() as TemplateData);
    expect(coversAll(next, null)).toBe(true);
    expect(coversAll(next, t(['t1'], '2026-09-08', '2026-12-18'))).toBe(true);
    expect(coversAll(next, t(['t1', 't3'], '2026-09-08', '2026-12-18'))).toBe(false); // t3 taken off
    expect(coversAll(next, t(['t1'], '2026-09-08', '2026-12-19'))).toBe(false); // ended earlier
  });
});

describe('sameTemplate', () => {
  it('ignores the order Firestore returns keys in', () => {
    const a = input() as TemplateData;
    const b = { teacherIds: a.teacherIds, slots: [{ locationId: 'loc1', end: '18:00', start: '16:00', days: [1, 2, 3, 4], id: 'a' }], endDate: a.endDate, startDate: a.startDate, name: a.name };
    expect(sameTemplate(a, b as TemplateData)).toBe(true);
    expect(sameTemplate(a, { ...a, teacherIds: ['t1'] })).toBe(false);
  });
});
