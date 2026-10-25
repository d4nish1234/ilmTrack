import { describe, expect, it } from 'vitest';
import {
  EARLY_START_MS,
  addDays,
  dateIn,
  distanceMeters,
  formatDistance,
  isValidTimeZone,
  locationVerdict,
  mondayOf,
  parseShift,
  startWindowProblem,
  weekStartIn,
  workedMinutes,
  zonedTimeToInstant,
} from '../src/timeclockCore';

const iso = (ms: number) => new Date(ms).toISOString();

describe('zonedTimeToInstant', () => {
  it('converts an ordinary wall time', () => {
    expect(iso(zonedTimeToInstant('2026-10-13', '16:00', 'America/Toronto'))).toBe('2026-10-13T20:00:00.000Z');
    expect(iso(zonedTimeToInstant('2026-10-13', '16:00', 'Europe/London'))).toBe('2026-10-13T15:00:00.000Z');
    expect(iso(zonedTimeToInstant('2026-10-13', '16:00', 'UTC'))).toBe('2026-10-13T16:00:00.000Z');
  });

  it('uses the right offset on each side of a DST change', () => {
    // Toronto falls back on Sunday 2026-11-01.
    expect(iso(zonedTimeToInstant('2026-10-31', '16:00', 'America/Toronto'))).toBe('2026-10-31T20:00:00.000Z');
    expect(iso(zonedTimeToInstant('2026-11-02', '16:00', 'America/Toronto'))).toBe('2026-11-02T21:00:00.000Z');
  });

  it('takes the first occurrence of a repeated hour', () => {
    expect(iso(zonedTimeToInstant('2026-11-01', '01:30', 'America/Toronto'))).toBe('2026-11-01T05:30:00.000Z');
  });

  it('moves a skipped wall time to after the change', () => {
    // 2027-03-14 02:30 does not exist in Toronto; the clock reads 03:30 then.
    expect(iso(zonedTimeToInstant('2027-03-14', '02:30', 'America/Toronto'))).toBe('2027-03-14T07:30:00.000Z');
  });
});

describe('dates and weeks', () => {
  // 2026-10-19 02:00 UTC: Sunday the 18th in Toronto, Monday the 19th in London.
  const now = Date.UTC(2026, 9, 19, 2, 0);

  it('reads the zone date', () => {
    expect(dateIn('America/Toronto', now)).toBe('2026-10-18');
    expect(dateIn('Europe/London', now)).toBe('2026-10-19');
  });

  it('finds the Monday of the zone week', () => {
    expect(weekStartIn('America/Toronto', now)).toBe('2026-10-12');
    expect(weekStartIn('Europe/London', now)).toBe('2026-10-19');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', -7)).toBe('2026-10-25');
  });

  it('validates zones', () => {
    expect(isValidTimeZone('America/Toronto')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe('parseShift', () => {
  const good = { id: 's1', date: '2026-10-13', start: '16:00', end: '17:00', locationId: 'l1' };

  it('accepts a sane shift', () => {
    expect(parseShift(good)).toEqual(good);
  });

  it('rejects anything malformed', () => {
    expect(parseShift(null)).toBeNull();
    expect(parseShift({ ...good, date: 'today' })).toBeNull();
    expect(parseShift({ ...good, start: '4pm' })).toBeNull();
    expect(parseShift({ ...good, end: '24:00' })).toBeNull();
    expect(parseShift({ ...good, end: '15:00' })).toBeNull();
    expect(parseShift({ ...good, id: '' })).toBeNull();
    expect(parseShift({ ...good, locationId: 5 })).toBeNull();
  });
});

describe('startWindowProblem', () => {
  const startAt = Date.UTC(2026, 9, 13, 20, 0);
  const endAt = Date.UTC(2026, 9, 13, 21, 0);

  it('opens 15 minutes early and closes at the end', () => {
    expect(startWindowProblem(startAt, endAt, startAt - EARLY_START_MS - 1)).toBe('too-early');
    expect(startWindowProblem(startAt, endAt, startAt - EARLY_START_MS)).toBeNull();
    expect(startWindowProblem(startAt, endAt, endAt - 1)).toBeNull();
    expect(startWindowProblem(startAt, endAt, endAt)).toMatch(/already finished/);
  });
});

describe('location', () => {
  it('measures distance', () => {
    // Roughly 1.11 km per 0.01° of latitude.
    const d = distanceMeters({ latitude: 43.7, longitude: -79.7 }, { latitude: 43.71, longitude: -79.7 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
  });

  it('confirms a clean reading inside the radius', () => {
    expect(locationVerdict(60, 20, 150)).toBe('confirmed');
  });

  it('blocks only when far even allowing for the reading\'s error', () => {
    expect(locationVerdict(2000, 30, 150)).toBe('far');
    expect(locationVerdict(400, 300, 150)).toBe('unconfirmed'); // could be inside
  });

  it('lets a fuzzy reading near the school through, unconfirmed', () => {
    expect(locationVerdict(120, 250, 150)).toBe('unconfirmed');
    expect(locationVerdict(165, 20, 150)).toBe('unconfirmed'); // just outside, within its error
    expect(locationVerdict(180, 20, 150)).toBe('far'); // outside even at its most generous
    expect(locationVerdict(100, NaN, 150)).toBe('confirmed');
  });

  it('formats distances', () => {
    expect(formatDistance(384)).toBe('380 m');
    expect(formatDistance(2120)).toBe('2.1 km');
  });
});

describe('workedMinutes', () => {
  const startAt = 1_000_000_000_000;
  const endAt = startAt + 60 * 60_000;
  const min = (n: number) => startAt + n * 60_000;

  it('counts closed segments and excludes breaks', () => {
    expect(workedMinutes([{ start: min(0), end: min(20) }, { start: min(30), end: min(50) }], startAt, endAt, min(55))).toBe(40);
  });

  it('runs an open segment to now', () => {
    expect(workedMinutes([{ start: min(10), end: null }], startAt, endAt, min(25))).toBe(15);
  });

  it('ignores time before the shift and caps at its end', () => {
    expect(workedMinutes([{ start: min(-10), end: null }], startAt, endAt, min(90))).toBe(60);
  });
});
