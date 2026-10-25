import { describe, it, expect } from 'vitest';
import {
  CSV_HEADER,
  clockedInNow,
  csvField,
  csvFileName,
  timesheetCsv,
  timesheetRows,
  totals,
  workedOfScheduled,
} from '../src/utils/timesheet';
import { zonedTimeToInstant } from '../src/utils/timeclock';
import type { Shift, TimeEntry } from '../src/types';

const ts = (ms: number) => ({ toMillis: () => ms });
const at = (hhmm: string, date = '2026-10-13') => new Date(`${date}T${hhmm}:00.000Z`).getTime();
const TZ = 'UTC';
const places = new Map([['l1', 'Main campus']]);

const shift = (id: string, start: string, end: string, date = '2026-10-13'): Shift => ({
  id, date, start, end, locationId: 'l1',
});

function entry(
  shiftId: string,
  status: TimeEntry['status'],
  segments: [number, number | null][],
  extra: Omit<Partial<TimeEntry>, 'startAt' | 'endAt'> & { startAt?: number; endAt?: number } = {},
  date = '2026-10-13'
): TimeEntry {
  const { startAt, endAt, ...rest } = extra;
  return {
    id: `org1_t1_${date}_${shiftId}`,
    orgId: 'org1', teacherId: 't1', shiftId, date, weekStart: '2026-10-12',
    startAt: ts(startAt ?? at('16:00', date)), endAt: ts(endAt ?? at('17:00', date)),
    locationName: 'Main campus', status,
    segments: segments.map(([s, e]) => ({ start: ts(s), end: e === null ? null : ts(e) })),
    ...rest,
  } as unknown as TimeEntry;
}

describe('zonedTimeToInstant (client, mirrors the server)', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  it('matches the server on ordinary times and both DST edges', () => {
    expect(iso(zonedTimeToInstant('2026-10-13', '16:00', 'America/Toronto'))).toBe('2026-10-13T20:00:00.000Z');
    expect(iso(zonedTimeToInstant('2026-11-02', '16:00', 'America/Toronto'))).toBe('2026-11-02T21:00:00.000Z');
    expect(iso(zonedTimeToInstant('2026-11-01', '01:30', 'America/Toronto'))).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(zonedTimeToInstant('2027-03-14', '02:30', 'America/Toronto'))).toBe('2027-03-14T07:30:00.000Z');
  });
});

describe('timesheetRows', () => {
  const shifts = [shift('s1', '16:00', '17:00'), shift('s2', '09:00', '12:00', '2026-10-17')];

  it('pairs each shift with what was worked', () => {
    const rows = timesheetRows(shifts, [entry('s1', 'done', [[at('16:05'), at('16:50')]], { workedMinutes: 45 })], places, TZ, at('18:00'));
    expect(rows.map((r) => [r.shiftId, r.status, r.workedMinutes, r.scheduledMinutes])).toEqual([
      ['s1', 'worked', 45, 60],
      ['s2', 'upcoming', 0, 180],
    ]);
    expect(rows[0].workedFrom).toBe('16:05');
    expect(rows[0].workedTo).toBe('16:50');
    expect(rows[0].locationName).toBe('Main campus');
  });

  it('marks a past shift with no time as not started', () => {
    const [r] = timesheetRows([shift('s1', '16:00', '17:00')], [], places, TZ, at('17:30'));
    expect(r.status).toBe('not-started');
  });

  it("shows a shift that's on now but wasn't started as late, not missed", async () => {
    const [r] = timesheetRows([shift('s1', '16:00', '17:00')], [], places, TZ, at('16:20'));
    expect(r.status).toBe('late');
  });

  it('counts a running shift up to now, and shows it as on shift', () => {
    const [r] = timesheetRows([shift('s1', '16:00', '17:00')], [entry('s1', 'running', [[at('16:00'), null]])], places, TZ, at('16:25'));
    expect(r.status).toBe('running');
    expect(r.workedMinutes).toBe(25);
  });

  it('shows the worked start as the scheduled start after an early start', () => {
    const [r] = timesheetRows([shift('s1', '16:00', '17:00')], [entry('s1', 'done', [[at('15:50'), at('16:30')]], { workedMinutes: 30 })], places, TZ, at('18:00'));
    expect(r.workedFrom).toBe('16:00');
  });

  it("keeps a worked shift that was later removed, so its hours aren't lost", () => {
    const rows = timesheetRows([], [entry('gone', 'done', [[at('16:00'), at('16:40')]], { workedMinutes: 40 })], places, TZ, at('18:00'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ removed: true, start: '16:00', end: '17:00', workedMinutes: 40 });
    // Removed shifts count as worked but not as scheduled.
    expect(totals(rows)).toEqual({ scheduledMinutes: 0, workedMinutes: 40 });
  });

  it('labels a shift whose location was deleted', () => {
    const [r] = timesheetRows([{ ...shift('s1', '16:00', '17:00'), locationId: 'gone' }], [], places, TZ, at('12:00'));
    expect(r.locationName).toBe('Location removed');
  });

  it('totals worked against scheduled', () => {
    const rows = timesheetRows(shifts, [entry('s1', 'done', [[at('16:00'), at('16:50')]], { workedMinutes: 50 })], places, TZ, at('18:00'));
    expect(workedOfScheduled(rows)).toBe('50m / 4h');
  });
});

describe('clockedInNow', () => {
  it('counts open shifts that are still within their time', () => {
    const now = at('16:30');
    const list = [
      entry('a', 'running', [[at('16:00'), null]]),
      entry('b', 'paused', [[at('16:00'), at('16:10')]]),
      entry('c', 'done', [[at('16:00'), at('16:20')]]),
      entry('d', 'running', [[at('15:00'), null]], { endAt: at('16:00') }), // past its end: being closed
    ];
    expect(clockedInNow(list, now).map((e) => e.shiftId)).toEqual(['a', 'b']);
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses spreadsheet formulas a note could contain', () => {
    expect(csvField('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-')).toBe("'-");
    expect(csvField('\tcmd')).toBe("'\tcmd");
    expect(csvField('\r=1')).toBe(`"'\r=1"`);
  });

  it('writes one row per shift, with edits and notes', () => {
    const rows = timesheetRows(
      [shift('s1', '16:00', '17:00')],
      [
        entry('s1', 'done', [[at('16:00'), at('16:30')]], {
          workedMinutes: 30,
          note: 'Covered, then left',
          correction: { by: 'admin', at: ts(0), reason: 'Forgot to end' },
        } as Omit<Partial<TimeEntry>, 'startAt' | 'endAt'>),
      ],
      places, TZ, at('18:00')
    );
    const csv = timesheetCsv([{ teacher: { uid: 't1', name: 'Sara M', email: 's@x.com' }, rows }]);
    const [header, line, last] = csv.split('\r\n');
    expect(header).toBe(CSV_HEADER.join(','));
    expect(line).toBe(
      'Sara M,s@x.com,2026-10-13,Tue,16:00,17:00,Main campus,16:00,16:30,30,0:30,Worked,Yes,Forgot to end,"Covered, then left"'
    );
    expect(last).toBe(''); // ends with a line break
  });

  it('names the file after what was exported', () => {
    expect(csvFileName(['Test School'], '2026-10-12')).toBe('timesheet-test-school-2026-10-12.csv');
    expect(csvFileName(['Sara M.', 'Test School'], '2026-10-12')).toBe('timesheet-sara-m-test-school-2026-10-12.csv');
    expect(csvFileName([], '2026-10-12')).toBe('timesheet-week-2026-10-12.csv');
  });
});
