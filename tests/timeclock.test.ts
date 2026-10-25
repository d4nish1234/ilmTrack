import { describe, it, expect } from 'vitest';
import { barContent, countingFrom, focusOf, formatClock, formatWorked, shiftViews, timeClockScope, timekeepingOrgHints, wallTime, weekRangeLabel, weekTotals, workedMs } from '../src/utils/timeclock';
import type { MyTimekeeping, TimeEntry } from '../src/types';

const ts = (ms: number) => ({ toMillis: () => ms });
const at = (hhmm: string, date = '2026-10-13') => new Date(`${date}T${hhmm}:00.000Z`).getTime();
const EARLY = 15 * 60_000;
const UID = 't1';

function data(shifts: { id: string; date?: string; start: string; end: string }[], today = '2026-10-13'): MyTimekeeping {
  return {
    now: 0,
    earlyStartMs: EARLY,
    orgs: [
      {
        orgId: 'org1',
        orgName: 'School',
        timezone: 'UTC',
        weekStart: '2026-10-12',
        today,
        shifts: shifts.map((s) => {
          const date = s.date ?? '2026-10-13';
          return {
            id: s.id, date, start: s.start, end: s.end, locationId: 'l1', locationName: 'Main',
            startAt: at(s.start, date), endAt: at(s.end, date),
          };
        }),
      },
    ],
  };
}

function entry(
  shiftId: string,
  status: TimeEntry['status'],
  segments: [number, number | null][],
  date = '2026-10-13',
  times: { startAt?: number; endAt?: number; weekStart?: string } = {}
) {
  return {
    id: `org1_${UID}_${date}_${shiftId}`,
    orgId: 'org1',
    shiftId,
    date,
    weekStart: times.weekStart ?? '2026-10-12',
    locationName: 'Old hall',
    startAt: ts(times.startAt ?? at('16:00', date)),
    endAt: ts(times.endAt ?? at('17:00', date)),
    status,
    segments: segments.map(([s, e]) => ({ start: ts(s), end: e === null ? null : ts(e) })),
  } as unknown as TimeEntry;
}

const views = (d: MyTimekeeping, entries: TimeEntry[] = []) =>
  shiftViews(d, new Map(entries.map((e) => [e.id, e])), UID);

describe('workedMs', () => {
  it('counts closed and open segments inside the shift only', () => {
    const e = entry('s1', 'running', [[at('15:50'), at('16:20')], [at('16:30'), null]]);
    expect(workedMs(e, at('16:00'), at('17:00'), at('16:40'))).toBe(30 * 60_000);
    expect(workedMs(e, at('16:00'), at('17:00'), at('18:00'))).toBe(50 * 60_000);
  });
});

describe('formatting', () => {
  it('formats the live clock and totals', () => {
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock((42 * 60 + 10) * 1000)).toBe('0:42:10');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatWorked(65 * 60_000)).toBe('1h 5m');
    expect(formatWorked(60 * 60_000)).toBe('1h');
    expect(formatWorked(45 * 60_000)).toBe('45m');
  });
});

describe('focusOf', () => {
  const d = data([
    { id: 's1', start: '16:00', end: '17:00' },
    { id: 's2', date: '2026-10-17', start: '09:00', end: '12:00' },
  ]);

  it('shows nothing without shifts', () => {
    expect(focusOf([], at('12:00'), EARLY).kind).toBe('none');
  });

  it('is later-today until the window opens, then ready', () => {
    expect(focusOf(views(d), at('15:44'), EARLY).kind).toBe('later-today');
    expect(focusOf(views(d), at('15:45'), EARLY).kind).toBe('ready');
  });

  it('follows the open entry while running or on break', () => {
    expect(focusOf(views(d, [entry('s1', 'running', [[at('16:02'), null]])]), at('16:10'), EARLY).kind).toBe('running');
    expect(focusOf(views(d, [entry('s1', 'paused', [[at('16:02'), at('16:20')]])]), at('16:25'), EARLY).kind).toBe('paused');
  });

  it("totals today once today's shifts are over", () => {
    const f = focusOf(views(d, [entry('s1', 'done', [[at('16:00'), at('16:45')]])]), at('17:30'), EARLY);
    expect(f.kind).toBe('done-today');
    expect(f.kind === 'done-today' && f.workedTodayMs).toBe(45 * 60_000);
  });

  it('treats an open shift past its end as over (the server is closing it)', () => {
    const f = focusOf(views(d, [entry('s1', 'running', [[at('16:00'), null]])]), at('17:02'), EARLY);
    expect(f.kind).toBe('done-today');
    expect(f.kind === 'done-today' && f.workedTodayMs).toBe(60 * 60_000);
  });

  it('points at the next shift on a day without one', () => {
    const f = focusOf(views(d), at('10:00', '2026-10-14'), EARLY);
    // views() was built with today = the 13th; a later day has no shift today.
    expect(f.kind).toBe('upcoming');
    expect(f.kind === 'upcoming' && f.shift.id).toBe('s2');
  });

  it('is week-over after the last shift', () => {
    const f = focusOf(views(data([{ id: 's1', start: '16:00', end: '17:00' }], '2026-10-14')), at('12:00', '2026-10-14'), EARLY);
    expect(f.kind).toBe('week-over');
  });
});

describe('no shifts yet', () => {
  it('still shows the time clock to someone in a timekeeping org', () => {
    expect(focusOf([], at('12:00'), EARLY, true).kind).toBe('no-shifts');
  });

  it('shows nothing to everyone else', () => {
    expect(focusOf([], at('12:00'), EARLY, false).kind).toBe('none');
    expect(focusOf([], at('12:00'), EARLY).kind).toBe('none');
  });
});


describe('shiftViews when the schedule changed after a shift started', () => {
  it("shows the entry's own times and place once started, not the edited schedule's", () => {
    // Started under 16:00–17:00 at Old hall; the admin then moved it to 18:00–19:00.
    const d = data([{ id: 's1', start: '18:00', end: '19:00' }]);
    const [v] = views(d, [entry('s1', 'running', [[at('16:02'), null]])]);
    expect(v.start).toBe('16:00');
    expect(v.end).toBe('17:00');
    expect(v.startAt).toBe(at('16:00'));
    expect(v.locationName).toBe('Old hall');
    expect(workedMs(v.entry!, v.startAt, v.endAt, at('16:30'))).toBe(28 * 60_000);
  });

  it('keeps a running shift the admin deleted, so it can still be ended', () => {
    const d = data([]); // the schedule no longer has s1
    const list = views(d, [entry('s1', 'running', [[at('16:02'), null]])]);
    expect(list).toHaveLength(1);
    expect(list[0].entryId).toBe(`org1_${UID}_2026-10-13_s1`);
    expect(focusOf(list, at('16:30'), EARLY, true).kind).toBe('running');
  });

  it("keeps a finished shift's hours in the week after its shift was deleted", () => {
    const list = views(data([]), [entry('s1', 'done', [[at('16:00'), at('16:45')]])]);
    expect(list).toHaveLength(1);
    expect(list[0].entry?.status).toBe('done');
  });

  it("ignores entries from another week or an org that's no longer listed", () => {
    const d = data([]);
    const lastWeek = entry('s0', 'done', [[at('16:00', '2026-10-06'), at('17:00', '2026-10-06')]], '2026-10-06', {
      weekStart: '2026-10-05',
    });
    const otherOrg = { ...entry('s9', 'running', [[at('16:00'), null]]), orgId: 'gone', id: 'gone_t1_2026-10-13_s9' } as TimeEntry;
    expect(views(d, [lastWeek, otherOrg])).toEqual([]);
  });
});

describe('wallTime', () => {
  it('reads the clock in the given zone', () => {
    const ms = Date.UTC(2026, 9, 13, 20, 5); // 20:05 UTC
    expect(wallTime(ms, 'UTC')).toBe('20:05');
    expect(wallTime(ms, 'America/Toronto')).toBe('16:05');
    expect(wallTime(ms, 'Asia/Kolkata')).toBe('01:35');
  });
});

describe('countingFrom (when time starts counting)', () => {
  it('is the scheduled start when started early', () => {
    expect(countingFrom(entry('s1', 'running', [[at('15:55'), null]]), at('16:00'))).toBe(at('16:00'));
  });

  it('is the tap when started late', () => {
    expect(countingFrom(entry('s1', 'running', [[at('16:07'), null]]), at('16:00'))).toBe(at('16:07'));
  });

  it('is unknown before anything started', () => {
    expect(countingFrom({ segments: [] }, at('16:00'))).toBeNull();
  });
});

describe('timekeepingOrgHints', () => {
  it("collects the orgs of the teacher's classes and those they administer, once each", () => {
    expect(timekeepingOrgHints([{ orgId: 'b' }, {}, { orgId: 'a' }, { orgId: 'b' }], ['c', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('is empty for a teacher with no org at all, so the app skips the call', () => {
    expect(timekeepingOrgHints([{}, {}], [])).toEqual([]);
  });
});

describe('barContent (what the Classes bar says)', () => {
  const d = data([
    { id: 's1', start: '16:00', end: '17:00' },
    { id: 's2', date: '2026-10-17', start: '09:00', end: '12:00' },
  ]);
  const bar = (entries: TimeEntry[], now: number, pending: string | null = null) => {
    const f = focusOf(views(d, entries), now, EARLY, true);
    if (f.kind === 'none') throw new Error('unexpected none');
    return barContent(f, now, pending);
  };

  it('is blue with Start when a shift can begin', () => {
    expect(bar([], at('15:50'))).toEqual({ tone: 'ready', icon: 'timer-outline', label: 'Shift 4:00 PM–5:00 PM', action: 'Start' });
  });

  it('says when time will start counting after an early start', () => {
    const b = bar([entry('s1', 'running', [[at('15:55'), null]])], at('15:58'));
    expect(b.tone).toBe('running');
    expect(b.label).toBe('On shift · counting from 4:00 PM');
  });

  it('shows the live timer once the scheduled start has passed', () => {
    const b = bar([entry('s1', 'running', [[at('15:55'), null]])], at('16:10'));
    expect(b.label).toBe('On shift · 0:10:00');
    expect(b.action).toBe('Ends 5:00 PM');
  });

  it('says Ending… while an offline end is waiting to be sent', () => {
    const e = entry('s1', 'running', [[at('16:00'), null]]);
    expect(bar([e], at('16:30'), e.id).action).toBe('Ending…');
  });

  it('is amber on a break', () => {
    expect(bar([entry('s1', 'paused', [[at('16:00'), at('16:20')]])], at('16:25'))).toEqual({
      tone: 'paused', icon: 'pause-circle-outline', label: 'On break · 20m worked', action: 'Resume',
    });
  });

  it('is grey otherwise, starting "Timesheets:", with the plain timer icon', () => {
    expect(bar([], at('12:00')).label).toBe('Timesheets: Shift today at 4:00 PM');
    const done = bar([entry('s1', 'done', [[at('16:00'), at('16:45')]])], at('18:00'));
    expect(done).toMatchObject({ label: 'Timesheets: 45m worked today', icon: 'timer-outline' });
    expect(bar([], at('12:00', '2026-10-15')).label).toBe('Timesheets: Next shift Sat 9:00 AM');
    const over = barContent({ kind: 'week-over', workedWeekMs: 45 * 60_000 }, at('13:00', '2026-10-18'), null);
    expect(over).toMatchObject({ label: 'Timesheets: 45m worked this week', icon: 'timer-outline' });
    for (const now of [at('12:00'), at('18:00')]) expect(bar([], now).tone).toBe('idle');
  });

  it('tells a teacher with no shifts that the time clock exists', () => {
    expect(barContent({ kind: 'no-shifts' }, at('12:00'), null)).toEqual({
      tone: 'idle', icon: 'timer-outline', label: 'Timesheets: No shifts this week', action: '',
    });
  });
});

describe('weekRangeLabel', () => {
  it('shows a week within a month, across months, and in another year', () => {
    expect(weekRangeLabel('2026-10-12', 2026)).toBe('Oct 12 – 18');
    expect(weekRangeLabel('2026-09-28', 2026)).toBe('Sep 28 – Oct 4');
    expect(weekRangeLabel('2026-12-28', 2026)).toBe('Dec 28 – Jan 3, 2027');
    expect(weekRangeLabel('2025-10-13', 2026)).toBe('Oct 13 – 19, 2025');
  });
});

describe('weekTotals (history)', () => {
  it("totals worked against scheduled, using the server's final count when done", () => {
    const d = data([
      { id: 's1', start: '16:00', end: '17:00' },
      { id: 's2', date: '2026-10-15', start: '09:00', end: '12:00' }, // missed
    ]);
    const done = { ...entry('s1', 'done', [[at('16:00'), at('16:50')]]), workedMinutes: 45 } as TimeEntry; // corrected
    expect(weekTotals(d, views(d, [done]), at('18:00', '2026-10-20'))).toEqual({ workedMinutes: 45, scheduledMinutes: 240 });
  });

  it('counts hours on a shift removed after it was worked, but not as scheduled', () => {
    const d = data([]);
    const done = { ...entry('s1', 'done', [[at('16:00'), at('16:40')]]), workedMinutes: 40 } as TimeEntry;
    expect(weekTotals(d, views(d, [done]), at('18:00'))).toEqual({ workedMinutes: 40, scheduledMinutes: 0 });
  });

  it('counts a shift still open up to now, capped at its end', () => {
    const d = data([{ id: 's1', start: '16:00', end: '17:00' }]);
    const open = entry('s1', 'running', [[at('16:00'), null]]);
    expect(weekTotals(d, views(d, [open]), at('16:20')).workedMinutes).toBe(20);
    expect(weekTotals(d, views(d, [open]), at('19:00')).workedMinutes).toBe(60);
  });
});

describe('timeClockScope (which org the time clock follows)', () => {
  const two = (): MyTimekeeping => {
    const d = data([{ id: 's1', start: '16:00', end: '17:00' }]);
    const other = { ...d.orgs[0], orgId: 'org2', orgName: 'Other', shifts: d.orgs[0].shifts.map((s) => ({ ...s, id: 'b1' })) };
    return { ...d, orgs: [d.orgs[0], other] };
  };
  const ctx = (selectedOrgId: string | null, extra: Partial<{ hasClasses: boolean; administeredOrgIds: string[] }> = {}) => ({
    selectedOrgId, hasClasses: true, administeredOrgIds: [], ...extra,
  });
  const ids = ['org1', 'org2'];

  it("follows the selected class's organization", () => {
    expect(timeClockScope(views(two()), ids, at('12:00'), ctx('org2'))).toEqual(['org2']);
  });

  it('shows nothing for a class outside any organization, or one without timekeeping', () => {
    expect(timeClockScope(views(two()), ids, at('12:00'), ctx(null))).toEqual([]);
    expect(timeClockScope(views(two()), ids, at('12:00'), ctx('org-off'))).toEqual([]);
  });

  it('keeps an open shift in view whatever class is selected, until it ends', () => {
    const running = { ...entry('s1', 'running', [[at('16:00'), null]]) };
    const list = shiftViews(two(), new Map([[running.id, running]]), UID);
    expect(timeClockScope(list, ids, at('16:30'), ctx(null))).toEqual(['org1']);
    expect(timeClockScope(list, ids, at('16:30'), ctx('org2'))).toEqual(['org1']);
    // Past its end it's being closed: back to the selected class's org.
    expect(timeClockScope(list, ids, at('17:30'), ctx('org2'))).toEqual(['org2']);
  });

  it('shows an org admin with no classes the organizations they administer', () => {
    expect(timeClockScope(views(two()), ids, at('12:00'), ctx(null, { hasClasses: false, administeredOrgIds: ['org2'] }))).toEqual(['org2']);
  });
});

describe('weekTotals on a daylight-saving day', () => {
  it("counts scheduled time from the clock times, as the admin's timesheet does", () => {
    // 01:00–03:00 on the spring-forward day is one real hour; the admin's sheet says 2h.
    const d = data([{ id: 's1', start: '01:00', end: '03:00' }]);
    d.orgs[0].shifts[0].endAt = d.orgs[0].shifts[0].startAt + 60 * 60_000;
    expect(weekTotals(d, views(d), at('12:00')).scheduledMinutes).toBe(120);
  });
});
