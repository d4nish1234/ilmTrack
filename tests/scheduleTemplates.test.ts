import { describe, it, expect } from 'vitest';
import {
  changeSummary,
  dateRangeLabel,
  endAfterStartMoves,
  hasEnded,
  formatDays,
  skippedLines,
  slotSummary,
  templateDescription,
  templateProblem,
} from '../src/utils/scheduleTemplates';
import type { TemplateApplyResult, TemplateSlot } from '../src/types';

const slot = (over: Partial<TemplateSlot> = {}): TemplateSlot => ({
  id: 'a', days: [1, 2, 3, 4], start: '16:00', end: '18:00', locationId: 'loc1', ...over,
});
const draft = (over: object = {}) => ({
  name: 'Term 1', startDate: '2026-09-08', endDate: '2026-12-18', slots: [slot()], teacherIds: ['t1'], ...over,
});
const result = (over: Partial<TemplateApplyResult> = {}): TemplateApplyResult => ({
  templateId: 'tpl', added: 0, updated: 0, removed: 0, skipped: 0, teachers: [], ...over,
});
const teacher = (teacherId: string, over: object = {}) => ({
  teacherId, added: 0, updated: 0, removed: 0, skipped: [], skippedCount: 0, ...over,
});

describe('formatDays', () => {
  it('shows runs of three or more as a range', () => {
    expect(formatDays([1, 2, 3, 4])).toBe('Mon–Thu');
    expect(formatDays([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(formatDays([6, 1, 2, 3])).toBe('Mon–Wed, Sat');
    expect(formatDays([6, 7])).toBe('Sat, Sun');
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  });
});

describe('describing a template', () => {
  it('summarises a time and the whole template', () => {
    expect(slotSummary(slot())).toBe('Mon–Thu · 4:00 PM–6:00 PM');
    const t = { ...draft(), slots: [slot(), slot({ id: 'b', days: [6] })], teacherIds: ['t1', 't2'] };
    expect(templateDescription(t, 2026)).toBe('Mon–Thu · 4:00 PM–6:00 PM +1 more · Sep 8 – Dec 18 · 2 people');
    expect(templateDescription({ ...t, teacherIds: ['t1'] }, 2026)).toMatch(/· 1 person$/);
  });

  it('shows years only when needed', () => {
    expect(dateRangeLabel('2026-09-08', '2026-12-18', 2026)).toBe('Sep 8 – Dec 18');
    expect(dateRangeLabel('2027-01-05', '2027-03-26', 2026)).toBe('Jan 5 – Mar 26, 2027');
    expect(dateRangeLabel('2026-12-01', '2027-01-30', 2026)).toBe('Dec 1, 2026 – Jan 30, 2027');
  });
});

describe('templateProblem (the same messages as the server)', () => {
  const LOC = ['loc1'];
  it('accepts a complete template', () => {
    expect(templateProblem(draft(), LOC)).toBeNull();
  });

  it('catches each problem the server would', () => {
    expect(templateProblem(draft({ name: ' ' }), LOC)).toBe('Give the schedule a name.');
    expect(templateProblem(draft({ endDate: '2026-09-01' }), LOC)).toBe('The end date must be on or after the start date.');
    expect(templateProblem(draft({ endDate: '2027-09-09' }), LOC)).toBe('A schedule can cover at most a year.');
    expect(templateProblem(draft({ endDate: '2027-09-08' }), LOC)).toBeNull();
    expect(templateProblem(draft({ slots: [] }), LOC)).toBe('Add at least one time.');
    expect(templateProblem(draft({ slots: [slot({ days: [] })] }), LOC)).toBe('Choose the days for each time.');
    expect(templateProblem(draft({ slots: [slot({ start: '18:00', end: '16:00' })] }), LOC)).toBe('Each time must end after it starts.');
    expect(templateProblem(draft({ slots: [slot({ locationId: '' })] }), LOC)).toBe('Choose a location for each time.');
    expect(
      templateProblem(draft({ slots: [slot(), slot({ id: 'b', days: [4, 6], start: '17:00', end: '19:00' })] }), LOC)
    ).toBe('Two times overlap on Thursday.');
    expect(templateProblem(draft({ teacherIds: [] }), LOC)).toBe('Choose at least one person.');
  });
});

describe('the preview', () => {
  it('says what changes, for how many people', () => {
    expect(changeSummary(result({ added: 168, teachers: [teacher('a', { added: 84 }), teacher('b', { added: 84 })] }))).toBe(
      'Adds 168 shifts for 2 people.'
    );
    expect(
      changeSummary(result({ added: 3, updated: 1, removed: 2, teachers: [teacher('a', { added: 3, updated: 1, removed: 2 })] }))
    ).toBe('Adds 3 shifts, updates 1 shift and removes 2 shifts for 1 person.');
    expect(changeSummary(result())).toBe('No one’s shifts change.');
  });

  it("doesn't count someone whose shifts were only skipped", () => {
    const r = result({ added: 4, teachers: [teacher('a', { added: 4 }), teacher('b', { skippedCount: 4 })] });
    expect(changeSummary(r)).toBe('Adds 4 shifts for 1 person.');
  });

  it('lists skipped days by person, saying why', () => {
    const r = result({
      teachers: [
        teacher('a', {
          skippedCount: 3,
          skipped: [
            { date: '2026-11-17', start: '16:00', end: '18:00', reason: 'overlap' },
            { date: '2026-11-18', start: '16:00', end: '18:00', reason: 'overlap' },
          ],
        }),
        teacher('b', { added: 1 }),
      ],
    });
    expect(skippedLines(r, (uid) => (uid === 'a' ? 'Sara M' : '?'))).toEqual([
      'Sara M: Tue Nov 17, Wed Nov 18 (overlap another shift); and 1 more',
    ]);
  });

  it('groups different reasons, including a time that has already passed', () => {
    const r = result({
      teachers: [
        teacher('a', {
          skippedCount: 2,
          skipped: [
            { date: '2026-11-10', start: '10:00', end: '11:00', reason: 'past' },
            { date: '2026-11-17', start: '10:00', end: '11:00', reason: 'overlap' },
          ],
        }),
      ],
    });
    expect(skippedLines(r, () => 'Sara M')).toEqual([
      'Sara M: Tue Nov 17 (overlap another shift); Tue Nov 10 (new time already passed, so today keeps its old time)',
    ]);
  });
});

describe('moving the start date', () => {
  it('leaves the end alone while it is still after the start', () => {
    expect(endAfterStartMoves('2026-09-08', '2026-09-15', '2026-12-18')).toBe('2026-12-18');
    expect(endAfterStartMoves('2026-09-08', '2026-12-18', '2026-12-18')).toBe('2026-12-18'); // a one-day schedule
  });

  it('moves the end along, keeping the length, once the start passes it', () => {
    expect(endAfterStartMoves('2026-09-08', '2027-01-04', '2026-12-18')).toBe('2027-04-15'); // 101 days
  });

  it('never makes it longer than a year', () => {
    expect(endAfterStartMoves('2026-01-01', '2027-02-01', '2026-12-31')).toBe('2028-01-31');
  });
});

describe('hasEnded', () => {
  it('is true only after the last day', () => {
    expect(hasEnded({ endDate: '2026-11-12' }, '2026-11-12')).toBe(false);
    expect(hasEnded({ endDate: '2026-11-11' }, '2026-11-12')).toBe(true);
  });
});
