import { describe, it, expect } from 'vitest';
import {
  CHOSEN_READ_MAX,
  EXPORT_MAX_DAYS,
  escapeHtml,
  matchingPreset,
  pdfFileName,
  personTotals,
  presetRange,
  rangeLabel,
  rangeProblem,
  rangeWeeks,
  readChosenOnly,
  rowsInRange,
  timesheetHtml,
  weekRange,
} from '../src/utils/timesheetExport';
import type { TimesheetRow } from '../src/utils/timesheet';

const row = (date: string, extra: Partial<TimesheetRow> = {}): TimesheetRow => ({
  shiftId: `s-${date}`,
  date,
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
  ...extra,
});

describe('rangeProblem', () => {
  it('accepts a single day and a range up to the limit', () => {
    expect(rangeProblem({ from: '2026-11-13', to: '2026-11-13' })).toBeNull();
    expect(rangeProblem({ from: '2026-01-01', to: '2026-07-05' })).toBeNull(); // 186 days
  });

  it('refuses an end before the start, and more than the limit', () => {
    expect(rangeProblem({ from: '2026-11-13', to: '2026-11-12' })).toMatch(/before the start/);
    expect(EXPORT_MAX_DAYS).toBe(186);
    expect(rangeProblem({ from: '2026-01-01', to: '2026-07-06' })).toMatch(/six months/);
  });
});

describe('rangeWeeks', () => {
  it('lists the Monday of every week the range touches', () => {
    // Wed Nov 4 to Tue Nov 17, 2026
    expect(rangeWeeks({ from: '2026-11-04', to: '2026-11-17' })).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });

  it('is one week for days within it, Sunday included', () => {
    expect(rangeWeeks({ from: '2026-11-09', to: '2026-11-15' })).toEqual(['2026-11-09']);
  });

  it('crosses a year', () => {
    expect(rangeWeeks({ from: '2026-12-30', to: '2027-01-05' })).toEqual(['2026-12-28', '2027-01-04']);
  });
});

describe('presets', () => {
  const today = '2026-11-13'; // a Friday

  it('gives whole weeks and months', () => {
    expect(presetRange('this-week', today)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(presetRange('last-week', today)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(presetRange('this-month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetRange('last-month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('last month from January is December', () => {
    expect(presetRange('last-month', '2027-01-20')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('recognises the preset a range is, and nothing for other dates', () => {
    expect(matchingPreset({ from: '2026-11-02', to: '2026-11-08' }, today)).toBe('last-week');
    expect(matchingPreset({ from: '2026-11-02', to: '2026-11-09' }, today)).toBeNull();
  });

  it('weekRange runs Monday to Sunday', () => {
    expect(weekRange('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  });
});

describe('rowsInRange', () => {
  it('keeps the days in the range, both ends included', () => {
    const rows = ['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06'].map((d) => row(d));
    expect(rowsInRange(rows, { from: '2026-11-02', to: '2026-11-05' }).map((r) => r.date)).toEqual([
      '2026-11-02',
      '2026-11-05',
    ]);
  });
});

describe('personTotals', () => {
  it('counts removed shifts as worked but not scheduled, and shifts not started', () => {
    const t = personTotals([
      row('2026-11-02'),
      row('2026-11-03', { status: 'not-started', workedMinutes: 0, workedFrom: null, workedTo: null }),
      row('2026-11-04', { status: 'late', workedMinutes: 0 }),
      row('2026-11-05', { removed: true, workedMinutes: 60 }),
    ]);
    expect(t).toEqual({ shifts: 3, notStarted: 2, scheduledMinutes: 360, workedMinutes: 170 });
  });
});

describe('rangeLabel and pdfFileName', () => {
  it('labels a range, or a single day', () => {
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-30' })).toBe('Nov 1, 2026 – Nov 30, 2026');
    expect(rangeLabel({ from: '2026-11-13', to: '2026-11-13' })).toBe('Nov 13, 2026');
  });

  it('names the file after the organization and dates', () => {
    expect(pdfFileName('Test School!', { from: '2026-11-01', to: '2026-11-30' })).toBe(
      'timesheet-test-school-2026-11-01-to-2026-11-30.pdf'
    );
    expect(pdfFileName('', { from: '2026-11-13', to: '2026-11-13' })).toBe('timesheet-2026-11-13.pdf');
  });
});

describe('timesheetHtml', () => {
  const range = { from: '2026-11-02', to: '2026-11-08' };
  const base = { orgName: 'Test School', range, timezone: 'America/Toronto', preparedAt: 'Nov 13, 2026, 4:05 PM' };

  it('has a summary row and a section per person, with totals', () => {
    const html = timesheetHtml({
      ...base,
      people: [
        { teacher: { uid: 't1', name: 'Aisha Khan', email: 'aisha@example.com' }, rows: [row('2026-11-02'), row('2026-11-03')] },
        { teacher: { uid: 't2', name: 'Omar Ali', email: '' }, rows: [] },
      ],
    });
    expect(html).toContain('Test School · Nov 2, 2026 – Nov 8, 2026');
    expect(html).toContain('Times are America/Toronto');
    expect(html).toContain('<h2>Aisha Khan</h2>');
    expect(html).toContain('aisha@example.com');
    expect(html).toContain('Mon, Nov 2');
    expect(html).toContain('4:00 PM – 6:00 PM');
    expect(html).toContain('4:05 PM – 5:55 PM');
    expect(html).toContain('2 shifts · 4h scheduled');
    expect(html).toContain('3h 40m');
    // Someone chosen with no shifts still gets a section, saying so.
    expect(html).toContain('<h2>Omar Ali</h2>');
    expect(html).toContain('No shifts in these dates.');
  });

  it('shows admin edits, teacher notes and removed shifts under the row', () => {
    const entry = { note: 'Covered for Sara', correction: { reason: 'Forgot to end shift' } } as unknown as TimesheetRow['entry'];
    const html = timesheetHtml({
      ...base,
      people: [{ teacher: { uid: 't1', name: 'Aisha', email: '' }, rows: [row('2026-11-02', { entry, removed: true })] }],
    });
    expect(html).toContain('Edited by admin: Forgot to end shift');
    expect(html).toContain('Teacher&#39;s note: Covered for Sara');
    expect(html).toContain('Shift removed from the schedule after it was worked.');
  });

  it('escapes names, notes and locations so they cannot change the page', () => {
    const entry = { note: '<img src=x onerror=alert(1)>' } as unknown as TimesheetRow['entry'];
    const html = timesheetHtml({
      ...base,
      orgName: 'A & B <School>',
      people: [
        {
          teacher: { uid: 't1', name: '<b>Aisha</b>', email: '' },
          rows: [row('2026-11-02', { entry, locationName: '<script>x</script>' })],
        },
      ],
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Aisha');
    expect(html).toContain('A &amp; B &lt;School&gt;');
  });

  it('says so when no one had shifts', () => {
    expect(timesheetHtml({ ...base, people: [] })).toContain('No one had shifts in these dates.');
  });

  it('escapeHtml covers the five characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('readChosenOnly', () => {
  it("reads just the chosen people's weeks when some are left out, up to the limit", () => {
    expect(readChosenOnly(1, 20)).toBe(true);
    expect(readChosenOnly(CHOSEN_READ_MAX, 20)).toBe(true);
  });

  it('reads the whole organization for everyone, everyone chosen by name, or many people', () => {
    expect(readChosenOnly(null, 20)).toBe(false);
    expect(readChosenOnly(3, 3)).toBe(false);
    expect(readChosenOnly(CHOSEN_READ_MAX + 1, 40)).toBe(false);
  });
});
