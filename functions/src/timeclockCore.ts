/**
 * Pure time-clock logic: no Firestore, so it is unit-tested directly
 * (tests/timeclockCore.test.ts). The callables in timeclock.ts use it.
 *
 * Shifts are stored as wall-clock strings in the organization's timezone
 * ('2026-10-13', '16:00'). Everything that decides whether a teacher may start,
 * and how long they worked, works on exact instants (epoch ms) derived here.
 */

/** A shift may be started this long before its scheduled start. */
export const EARLY_START_MS = 15 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Timezones ───────────────────────────────────────────────────────────

/** The zone's wall-clock fields at an instant. Throws for an unknown zone. */
function wallClock(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which the zone's clock reads `date` `time`.
 *
 * In the hour skipped by a spring-forward change the wall time does not exist;
 * this returns the instant one hour later on the clock (02:30 → 03:30), which
 * is the conventional resolution. In the repeated hour of a fall-back change
 * it returns the first occurrence.
 */
export function zonedTimeToInstant(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // The offset at the first guess may differ from the offset at the answer
  // when a DST change falls between them, so try both.
  const first = asUtc - offsetAt(asUtc, timeZone);
  const second = asUtc - offsetAt(first, timeZone);
  const reads = (ms: number) => {
    const w = wallClock(ms, timeZone);
    return w.year === y && w.month === mo && w.day === d && w.hour === h && w.minute === mi;
  };
  const exact = [first, second].filter(reads);
  if (exact.length > 0) return Math.min(...exact); // first occurrence when repeated
  return first; // skipped hour: the reading after the change
}

/** The zone's date at an instant, 'yyyy-MM-dd'. */
export function dateIn(timeZone: string, ms: number): string {
  const w = wallClock(ms, timeZone);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday on or before this date. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** The Monday of the zone's current week. */
export function weekStartIn(timeZone: string, ms: number): string {
  return mondayOf(dateIn(timeZone, ms));
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ─── Shifts ──────────────────────────────────────────────────────────────

export interface ShiftData {
  id: string;
  date: string;
  start: string;
  end: string;
  locationId: string;
}

/**
 * Shifts are written by org admins and the rules check only the outer shape
 * of a week, so treat each one as untrusted: null unless every field is sane.
 */
export function parseShift(value: unknown): ShiftData | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (
    typeof s.id !== 'string' || !s.id ||
    typeof s.date !== 'string' || !DATE_RE.test(s.date) ||
    typeof s.start !== 'string' || !TIME_RE.test(s.start) ||
    typeof s.end !== 'string' || !TIME_RE.test(s.end) ||
    s.start >= s.end ||
    typeof s.locationId !== 'string'
  ) {
    return null;
  }
  return {
    id: s.id,
    date: s.date,
    start: s.start,
    end: s.end,
    locationId: s.locationId,
  };
}

/** Why the shift can't be started at `now`, or null if it can. */
export function startWindowProblem(startAt: number, endAt: number, now: number): string | null {
  if (now >= endAt) return 'This shift has already finished.';
  if (now < startAt - EARLY_START_MS) {
    return 'too-early';
  }
  return null;
}

// ─── Location ────────────────────────────────────────────────────────────

/** Great-circle distance in metres. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type LocationVerdict = 'confirmed' | 'unconfirmed' | 'far';

/**
 * Lenient by design. A glitchy or fuzzy reading must never stop a teacher who
 * is really at school, so only a reading that is outside the radius even
 * after allowing for its own error margin counts as far. Anything else that
 * isn't a clean reading inside the radius is 'unconfirmed': allowed, and
 * flagged for the admin.
 */
export function locationVerdict(distanceM: number, accuracyM: number, radiusM: number): LocationVerdict {
  const accuracy = Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 0;
  if (distanceM - accuracy > radiusM) return 'far';
  if (distanceM <= radiusM && accuracy <= Math.max(radiusM, 100)) return 'confirmed';
  return 'unconfirmed';
}

/** '400 m' or '2.1 km' */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

// ─── Worked time ─────────────────────────────────────────────────────────

export interface Segment {
  start: number;
  end: number | null;
}

/**
 * Minutes worked, counting only time inside the scheduled shift. An open
 * segment runs to `now`, so the result is right even before the shift is
 * closed. Time before the shift's start (an early start) isn't counted.
 */
export function workedMinutes(segments: Segment[], startAt: number, endAt: number, now: number): number {
  let ms = 0;
  for (const s of segments) {
    const from = Math.max(s.start, startAt);
    const to = Math.min(s.end ?? now, endAt);
    if (to > from) ms += to - from;
  }
  return Math.floor(ms / 60_000);
}
