/**
 * Teacher time clock: start, break, resume and end a scheduled shift.
 *
 * Every action goes through these callables so the server decides the time
 * (a phone's clock can be wrong) and checks the shift, its window, the
 * teacher's location and that they belong to the organization. Clients can
 * read their own time entries but never write them (firestore.rules).
 *
 *   timeEntries/{orgId}_{teacherId}_{date}_{shiftId}   one per shift worked
 *   activeShifts/{teacherId}                           at most one open shift
 *
 * The entry id is deterministic, so starting twice is harmless, and every
 * action is a transaction setting absolute values.
 *
 * Location is checked, never stored. Start and Resume send the phone's
 * position; the server measures it against the shift's location and either
 * allows the action or refuses it. No coordinates, distance or verdict is
 * saved anywhere, and End doesn't ask for a position at all.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp, getFirestore, type Transaction } from 'firebase-admin/firestore';
import {
  addDays,
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
  dateIn,
  EARLY_START_MS,
  type ShiftData,
} from './timeclockCore';

const REGION = 'us-central1';
const NOTE_MAX = 500;
const ORG_HINT_MAX = 20;
const REASON_MAX = 200;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Status = 'running' | 'paused' | 'done';

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  mocked?: boolean;
}

interface StoredSegment {
  start: Timestamp;
  end: Timestamp | null;
}

interface TimeEntry {
  orgId: string;
  teacherId: string;
  shiftId: string;
  date: string;
  weekStart: string;
  startAt: Timestamp;
  endAt: Timestamp;
  timezone: string;
  locationId: string;
  /**
   * Kept on the record on purpose: it says where the work happened even if
   * the location is later renamed or deleted.
   */
  locationName: string;
  status: Status;
  segments: StoredSegment[];
  note?: string;
  endedBy?: 'teacher' | 'schedule' | 'admin';
  workedMinutes?: number;
  /** The latest admin correction. */
  correction?: { by: string; at: Timestamp; reason: string };
  /**
   * How the teacher's own record stood before the first correction, kept for
   * the record. Null when the admin added time for a shift never started.
   */
  original?: { segments: StoredSegment[]; workedMinutes: number; endedBy: string | null } | null;
  /** Present only while open: equals endAt. The close-out job queries it. */
  openUntil?: Timestamp;
}

const db = () => getFirestore();

function fail(code: 'failed-precondition' | 'not-found' | 'permission-denied' | 'invalid-argument', message: string, reason?: string): never {
  throw new HttpsError(code, message, reason ? { reason } : undefined);
}

function requireUid(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth.uid;
}

function parsePosition(value: unknown): Position | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const ok = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (!ok(p.latitude, -90, 90) || !ok(p.longitude, -180, 180)) return null;
  return {
    latitude: p.latitude as number,
    longitude: p.longitude as number,
    accuracy: typeof p.accuracy === 'number' && Number.isFinite(p.accuracy) && p.accuracy >= 0 ? p.accuracy : 0,
    mocked: p.mocked === true,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 200) {
    fail('invalid-argument', `Missing ${name}.`);
  }
  return value;
}

/** Owner or co-teacher of one of the org's classes, or one of its admins. */
async function belongsToOrg(orgId: string, uid: string, memberUserIds: string[]): Promise<boolean> {
  if (memberUserIds.includes(uid)) return true;
  const classes = db().collection('classes').where('orgId', '==', orgId);
  const [owned, coTaught] = await Promise.all([
    classes.where('teacherId', '==', uid).limit(1).get(),
    classes.where('adminUserIds', 'array-contains', uid).limit(1).get(),
  ]);
  return !owned.empty || !coTaught.empty;
}

interface OrgContext {
  orgName: string;
  timezone: string;
  locations: { id: string; name: string; latitude: number; longitude: number; radiusM: number }[];
}

/**
 * The org's timekeeping, if it is on and usable; otherwise a clear refusal.
 * Pass `knownMember` when membership was already established by the caller,
 * to skip the class queries.
 */
async function loadOrg(orgId: string, uid: string, knownMember = false): Promise<OrgContext> {
  const [orgSnap, tkSnap] = await Promise.all([
    db().collection('organizations').doc(orgId).get(),
    db().collection('timekeeping').doc(orgId).get(),
  ]);
  if (!orgSnap.exists) fail('not-found', 'That organization no longer exists.');
  const tk = tkSnap.data();
  if (!tk?.enabled) fail('failed-precondition', 'Timekeeping is turned off for this organization.');
  if (!isValidTimeZone(tk.timezone)) {
    fail('failed-precondition', "Timekeeping isn't fully set up yet (no timezone). Ask your admin.");
  }
  const org = orgSnap.data()!;
  if (!knownMember && !(await belongsToOrg(orgId, uid, org.memberUserIds ?? []))) {
    fail('permission-denied', "You aren't a teacher in this organization.");
  }
  return {
    orgName: org.name ?? '',
    timezone: tk.timezone,
    locations: Array.isArray(tk.locations) ? tk.locations : [],
  };
}

/**
 * May this position start or resume the shift? Throws a refusal when it is
 * clearly away from the shift's location, or a mock location. Nothing about
 * the position is kept.
 */
function checkLocation(position: Position, location: OrgContext['locations'][number] | undefined): void {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    fail('failed-precondition', "This shift's location was removed. Ask your admin to choose another.", 'no-location');
  }
  if (position.mocked) {
    fail(
      'failed-precondition',
      'Your phone is reporting a mock location. Turn off any mock location app to start a shift.',
      'mock-location'
    );
  }
  const distanceM = distanceMeters(position, location);
  const radiusM = Number.isFinite(location.radiusM) && location.radiusM > 0 ? location.radiusM : 150;
  if (locationVerdict(distanceM, position.accuracy, radiusM) === 'far') {
    fail('failed-precondition', `You're about ${formatDistance(distanceM)} from ${location.name}.`, 'too-far');
  }
}

/**
 * Read the teacher's lock inside a transaction. Must happen before any write,
 * so callers fetch it up front and hand it to closeEntry.
 */
async function getLock(tx: Transaction, teacherId: string) {
  const ref = db().collection('activeShifts').doc(teacherId);
  return { ref, snap: await tx.get(ref) };
}

/** Close the open segment and the entry at `at` (never past the shift's end). */
function closeEntry(
  tx: Transaction,
  ref: FirebaseFirestore.DocumentReference,
  entry: TimeEntry,
  at: number,
  endedBy: 'teacher' | 'schedule',
  lock: Awaited<ReturnType<typeof getLock>>
) {
  const endAt = entry.endAt.toMillis();
  const closeAt = Math.min(at, endAt);
  const segments = entry.segments.map((s) =>
    s.end ? s : { start: s.start, end: Timestamp.fromMillis(Math.max(closeAt, s.start.toMillis())) }
  );
  const worked = workedMinutes(
    segments.map((s) => ({ start: s.start.toMillis(), end: s.end ? s.end.toMillis() : null })),
    entry.startAt.toMillis(),
    endAt,
    closeAt
  );
  tx.update(ref, {
    segments,
    status: 'done',
    endedBy,
    workedMinutes: worked,
    openUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Release the lock only if it is still this shift's. With back-to-back
  // shifts the next one may already hold it, and deleting that would let a
  // second timer start alongside it.
  if (lock.snap.exists && lock.snap.data()?.entryId === ref.id) {
    tx.delete(lock.ref);
  }
}

/**
 * Move a schedule-closed entry's end earlier, to `at`. Segments are trimmed
 * at `at`; any that began after it are dropped. Never moves the end later.
 */
function reopenAndClose(tx: Transaction, ref: FirebaseFirestore.DocumentReference, entry: TimeEntry, at: number) {
  const segments = entry.segments
    .filter((s) => s.start.toMillis() < at)
    .map((s) => (s.end && s.end.toMillis() <= at ? s : { start: s.start, end: Timestamp.fromMillis(at) }));
  if (segments.length === 0) return; // tapped before the shift began: nothing sensible to change
  const lastEnd = Math.max(...segments.map((s) => s.end!.toMillis()));
  const previousEnd = Math.max(...entry.segments.map((s) => (s.end ? s.end.toMillis() : 0)));
  if (lastEnd >= previousEnd) return; // would not shorten
  tx.update(ref, {
    segments,
    endedBy: 'teacher',
    workedMinutes: workedMinutes(
      segments.map((s) => ({ start: s.start.toMillis(), end: s.end!.toMillis() })),
      entry.startAt.toMillis(),
      entry.endAt.toMillis(),
      at
    ),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function getOwnEntry(tx: Transaction, entryId: string, uid: string) {
  const ref = db().collection('timeEntries').doc(entryId);
  const snap = await tx.get(ref);
  if (!snap.exists) fail('not-found', 'That shift has not been started.');
  const entry = snap.data() as TimeEntry;
  if (entry.teacherId !== uid) fail('permission-denied', 'That shift belongs to someone else.');
  return { ref, entry };
}

// ─── Callables ───────────────────────────────────────────────────────────

/**
 * Every organization where timekeeping is on and the caller belongs — they
 * own or co-teach one of its classes, or administer it — with their shifts
 * this week (possibly none). Including orgs without shifts is deliberate: it
 * shows teachers the time clock exists before they're first scheduled.
 *
 * "This week" is each organization's own week, in its timezone. Teachers
 * can't read timekeeping settings directly, so this is how the app learns
 * whether timekeeping is on, the org's name and where it is.
 */
export const getMyTimekeeping = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const now = Date.now();

  // Every timezone's current Monday is within a day of UTC's, so these three
  // candidate weeks cover it; the right one is chosen per org below.
  const utcMonday = mondayOf(new Date(now).toISOString().slice(0, 10));
  const candidates = [addDays(utcMonday, -7), utcMonday, addDays(utcMonday, 7)];
  const schedules = await db()
    .collection('schedules')
    .where('teacherId', '==', uid)
    .where('weekStart', 'in', candidates)
    .get();

  const byOrg = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  // Orgs whose membership is already proven, so loadOrg needn't query classes.
  const knownMember = new Set<string>();
  for (const d of schedules.docs) {
    const orgId = d.data().orgId as string;
    byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), d]);
  }

  // Organizations they administer: one query, and membership is proven.
  const administered = await db()
    .collection('organizations')
    .where('memberUserIds', 'array-contains', uid)
    .get();
  for (const d of administered.docs) {
    if (!byOrg.has(d.id)) byOrg.set(d.id, []);
    knownMember.add(d.id);
  }

  // Organizations of the classes they teach, as hinted by the app (it already
  // has its classes). Only candidates: loadOrg verifies each with two
  // single-document lookups, which is far cheaper than reading every class the
  // teacher owns. Capped, and ignored when malformed.
  const hinted = Array.isArray(request.data?.orgIds) ? (request.data.orgIds as unknown[]) : [];
  for (const orgId of hinted.slice(0, ORG_HINT_MAX)) {
    if (typeof orgId === 'string' && /^[A-Za-z0-9]{1,64}$/.test(orgId) && !byOrg.has(orgId)) {
      byOrg.set(orgId, []);
    }
  }

  const orgs = [];
  for (const [orgId, docs] of byOrg) {
    let ctx: OrgContext;
    try {
      ctx = await loadOrg(orgId, uid, knownMember.has(orgId));
    } catch {
      continue; // off, not set up, or no longer theirs: show nothing for it
    }
    const weekStart = weekStartIn(ctx.timezone, now);
    const week = docs.find((d) => d.data().weekStart === weekStart);
    const shifts = ((week?.data().shifts ?? []) as unknown[])
      .map(parseShift)
      .filter((s): s is ShiftData => s !== null)
      .map((s) => ({
        ...s,
        // From the settings, so a renamed location shows its current name.
        locationName: ctx.locations.find((l) => l.id === s.locationId)?.name ?? '',
        startAt: zonedTimeToInstant(s.date, s.start, ctx.timezone),
        endAt: zonedTimeToInstant(s.date, s.end, ctx.timezone),
      }))
      .sort((a, b) => a.startAt - b.startAt);
    orgs.push({
      orgId,
      orgName: ctx.orgName,
      timezone: ctx.timezone,
      weekStart,
      today: dateIn(ctx.timezone, now),
      shifts,
    });
  }

  return { now, earlyStartMs: EARLY_START_MS, orgs };
});

export const startShift = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const orgId = requireString(data.orgId, 'organization');
  const weekStart = requireString(data.weekStart, 'week');
  const shiftId = requireString(data.shiftId, 'shift');
  const position = parsePosition(data.position);
  if (!position) fail('invalid-argument', 'Your location is needed to start a shift.', 'no-position');

  const ctx = await loadOrg(orgId, uid);
  const scheduleSnap = await db().collection('schedules').doc(`${orgId}_${uid}_${weekStart}`).get();
  const raw = ((scheduleSnap.data()?.shifts ?? []) as unknown[]).find(
    (s) => (s as { id?: unknown })?.id === shiftId
  );
  const shift = parseShift(raw);
  if (!shift) fail('not-found', 'That shift is no longer on your schedule.');

  const startAt = zonedTimeToInstant(shift.date, shift.start, ctx.timezone);
  const endAt = zonedTimeToInstant(shift.date, shift.end, ctx.timezone);
  const now = Date.now();
  const window = startWindowProblem(startAt, endAt, now);
  if (window === 'too-early') {
    fail(
      'failed-precondition',
      `This shift opens ${EARLY_START_MS / 60_000} minutes before it starts.`,
      'too-early'
    );
  }
  if (window) fail('failed-precondition', window, 'finished');

  const location = ctx.locations.find((l) => l.id === shift.locationId);
  checkLocation(position, location);

  const entryId = `${orgId}_${uid}_${shift.date}_${shift.id}`;
  const entryRef = db().collection('timeEntries').doc(entryId);
  const lockRef = db().collection('activeShifts').doc(uid);

  await db().runTransaction(async (tx) => {
    const [entrySnap, lockSnap] = await Promise.all([tx.get(entryRef), tx.get(lockRef)]);
    if (entrySnap.exists) {
      const status = (entrySnap.data() as TimeEntry).status;
      if (status === 'done') fail('failed-precondition', 'This shift has already ended.', 'finished');
      return; // already running or on break: starting again changes nothing
    }
    const lock = lockSnap.data();
    if (lock && lock.entryId !== entryId && (lock.until as Timestamp).toMillis() > now) {
      const other = await tx.get(db().collection('timeEntries').doc(lock.entryId as string));
      const where = (other.data() as TimeEntry | undefined)?.locationName || 'another location';
      fail('failed-precondition', `You're already on a shift at ${where}. End it first.`, 'already-on-shift');
    }

    const entry: TimeEntry = {
      orgId,
      teacherId: uid,
      shiftId: shift.id,
      date: shift.date,
      weekStart,
      startAt: Timestamp.fromMillis(startAt),
      endAt: Timestamp.fromMillis(endAt),
      timezone: ctx.timezone,
      locationId: shift.locationId,
      locationName: location!.name,
      status: 'running',
      segments: [{ start: Timestamp.fromMillis(now), end: null }],
      openUntil: Timestamp.fromMillis(endAt),
    };
    tx.set(entryRef, { ...entry, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(lockRef, { entryId, until: Timestamp.fromMillis(endAt) });
  });

  return { entryId };
});

export const pauseShift = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const entryId = requireString((request.data ?? {}).entryId, 'shift');
  const now = Date.now();

  await db().runTransaction(async (tx) => {
    const { ref, entry } = await getOwnEntry(tx, entryId, uid);
    const lock = await getLock(tx, uid);
    if (entry.status === 'paused') return;
    if (entry.status !== 'running') fail('failed-precondition', 'This shift has already ended.', 'finished');
    if (now >= entry.endAt.toMillis()) {
      // The shift ran out before the break was taken; it simply ended.
      closeEntry(tx, ref, entry, now, 'schedule', lock);
      return;
    }
    tx.update(ref, {
      segments: entry.segments.map((s) => (s.end ? s : { start: s.start, end: Timestamp.fromMillis(now) })),
      status: 'paused',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { entryId };
});

export const resumeShift = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const entryId = requireString(data.entryId, 'shift');
  const position = parsePosition(data.position);
  if (!position) fail('invalid-argument', 'Your location is needed to resume.', 'no-position');
  const now = Date.now();

  // Read once outside the transaction for the location, which needs the org.
  // Ownership first: entry ids are guessable, and loadOrg's refusals would
  // otherwise tell anyone whether some org has timekeeping on.
  const first = await db().collection('timeEntries').doc(entryId).get();
  if (!first.exists) fail('not-found', 'That shift has not been started.');
  if ((first.data() as TimeEntry).teacherId !== uid) {
    fail('permission-denied', 'That shift belongs to someone else.');
  }
  const ctx = await loadOrg((first.data() as TimeEntry).orgId, uid);

  await db().runTransaction(async (tx) => {
    const { ref, entry } = await getOwnEntry(tx, entryId, uid);
    const lock = await getLock(tx, uid);
    if (entry.status === 'running') return;
    if (entry.status !== 'paused') fail('failed-precondition', 'This shift has already ended.', 'finished');
    if (now >= entry.endAt.toMillis()) {
      closeEntry(tx, ref, entry, now, 'schedule', lock);
      return;
    }
    checkLocation(position, ctx.locations.find((l) => l.id === entry.locationId));
    tx.update(ref, {
      segments: [...entry.segments, { start: Timestamp.fromMillis(now), end: null }],
      status: 'running',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { entryId };
});

/**
 * End the shift. No position is asked for: ending is never blocked, and
 * nothing about where it happened is recorded. `endedAt` is the moment the
 * teacher tapped End, sent when the app had to queue the end while offline;
 * it is trusted only to shorten the shift (clamped between the last segment's
 * start and now).
 */
export const endShift = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const entryId = requireString(data.entryId, 'shift');
  const now = Date.now();

  await db().runTransaction(async (tx) => {
    const { ref, entry } = await getOwnEntry(tx, entryId, uid);
    const lock = await getLock(tx, uid);
    const tapped = typeof data.endedAt === 'number' && Number.isFinite(data.endedAt) ? data.endedAt : null;

    if (entry.status === 'done') {
      // An End tapped offline can arrive after the close-out job already
      // ended the shift at its scheduled time. Honour the earlier tap, or the
      // teacher is credited for time they didn't work. Only ever shortens,
      // and only a schedule close: a teacher's own End is final.
      if (entry.endedBy === 'schedule' && tapped !== null) {
        reopenAndClose(tx, ref, entry, tapped);
      }
      return;
    }
    const lastStart = Math.max(...entry.segments.map((s) => s.start.toMillis()));
    closeEntry(tx, ref, entry, Math.min(Math.max(tapped ?? now, lastStart), now), 'teacher', lock);
  });
  return { entryId };
});

export const setShiftNote = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const entryId = requireString(data.entryId, 'shift');
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, NOTE_MAX) : '';

  await db().runTransaction(async (tx) => {
    const { ref } = await getOwnEntry(tx, entryId, uid);
    tx.update(ref, {
      note: note || FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { entryId };
});

// ─── Admin corrections ───────────────────────────────────────────────────

/**
 * An org admin sets how long a teacher actually worked on one shift: worked
 * from `start` to `end` (wall-clock, the org's timezone, the shift's date),
 * with a reason. Used to fix a forgotten End or a glitchy Start, and to add
 * time for a shift the teacher never started.
 *
 * The worked time must fall within the shift as scheduled now, so to pay for
 * staying late the admin first extends the shift, then corrects it. (If the
 * shift was deleted after it ran, the entry's own times are the bounds.) A
 * shift still running can't be corrected: there's nothing final to correct.
 *
 * The teacher's own record is kept in `original` the first time, so a
 * correction never erases what they recorded.
 */
export const correctTimeEntry = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const orgId = requireString(data.orgId, 'organization');
  const teacherId = requireString(data.teacherId, 'teacher');
  const weekStart = requireString(data.weekStart, 'week');
  const shiftId = requireString(data.shiftId, 'shift');
  const date = requireString(data.date, 'date');
  const start = requireString(data.start, 'start time');
  const end = requireString(data.end, 'end time');
  const reason = typeof data.reason === 'string' ? data.reason.trim().slice(0, REASON_MAX) : '';

  if (!DATE_RE.test(date) || !DATE_RE.test(weekStart)) fail('invalid-argument', 'That date is not valid.');
  // The entry is filed under its week; a wrong one would hide it from the timesheet.
  if (mondayOf(date) !== weekStart) fail('invalid-argument', 'That date is not in that week.');
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) fail('invalid-argument', 'Those times are not valid.');
  if (start >= end) fail('invalid-argument', 'The end must be after the start.');
  if (!reason) fail('invalid-argument', 'Say why the time is being corrected.', 'no-reason');

  const [orgSnap, tkSnap] = await Promise.all([
    db().collection('organizations').doc(orgId).get(),
    db().collection('timekeeping').doc(orgId).get(),
  ]);
  const memberUserIds = (orgSnap.data()?.memberUserIds ?? []) as string[];
  if (!orgSnap.exists || !memberUserIds.includes(uid)) {
    fail('permission-denied', "Only this organization's admins can correct hours.");
  }
  const timezone = tkSnap.data()?.timezone;
  if (!isValidTimeZone(timezone)) fail('failed-precondition', 'Timekeeping has no timezone set.');

  const scheduleSnap = await db().collection('schedules').doc(`${orgId}_${teacherId}_${weekStart}`).get();
  const scheduled = parseShift(
    ((scheduleSnap.data()?.shifts ?? []) as unknown[]).find((s) => (s as { id?: unknown })?.id === shiftId)
  );
  if (scheduled && scheduled.date !== date) fail('invalid-argument', 'That shift is on another day.');

  const entryRef = db().collection('timeEntries').doc(`${orgId}_${teacherId}_${date}_${shiftId}`);
  const workedFrom = zonedTimeToInstant(date, start, timezone);
  const workedTo = zonedTimeToInstant(date, end, timezone);
  const now = Date.now();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(entryRef);
    const existing = snap.exists ? (snap.data() as TimeEntry) : null;
    if (!scheduled && !existing) fail('not-found', 'That shift is no longer on the schedule.');

    // Bounds: the shift as scheduled now, or, if it was deleted after it ran,
    // the times the entry recorded.
    const startAt = scheduled ? zonedTimeToInstant(date, scheduled.start, timezone) : existing!.startAt.toMillis();
    const endAt = scheduled ? zonedTimeToInstant(date, scheduled.end, timezone) : existing!.endAt.toMillis();
    if (workedFrom < startAt || workedTo > endAt) {
      fail(
        'invalid-argument',
        'Worked time must be within the shift. To pay for longer, extend the shift first.',
        'outside-shift'
      );
    }
    if (workedFrom > now) fail('invalid-argument', "You can't record time that hasn't happened yet.");
    if (existing && existing.status !== 'done' && now < existing.endAt.toMillis()) {
      fail('failed-precondition', 'This shift is still running. Correct it once it has ended.', 'still-running');
    }
    if (!existing && now < endAt) {
      // Adding time now would mark the shift ended, and the teacher could no
      // longer start it.
      fail('failed-precondition', 'This shift is still on. Add time once it has ended.', 'not-over');
    }

    const segments = [{ start: Timestamp.fromMillis(workedFrom), end: Timestamp.fromMillis(Math.min(workedTo, now)) }];
    const worked = workedMinutes(
      segments.map((s) => ({ start: s.start.toMillis(), end: s.end.toMillis() })),
      startAt,
      endAt,
      now
    );
    const correction = { by: uid, at: Timestamp.fromMillis(now), reason };

    if (existing) {
      tx.update(entryRef, {
        startAt: Timestamp.fromMillis(startAt),
        endAt: Timestamp.fromMillis(endAt),
        segments,
        status: 'done',
        endedBy: 'admin',
        workedMinutes: worked,
        correction,
        // Keep the teacher's own record the first time only.
        ...(existing.original === undefined
          ? {
              original: {
                segments: existing.segments,
                // An entry still open past its end (the close-out job hasn't
                // run yet) has no workedMinutes: count it as closeEntry would.
                workedMinutes:
                  existing.workedMinutes ??
                  workedMinutes(
                    existing.segments.map((s) => ({ start: s.start.toMillis(), end: s.end ? s.end.toMillis() : null })),
                    existing.startAt.toMillis(),
                    existing.endAt.toMillis(),
                    Math.min(now, existing.endAt.toMillis())
                  ),
                endedBy: existing.endedBy ?? null,
              },
            }
          : {}),
        openUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const location = (Array.isArray(tkSnap.data()?.locations) ? tkSnap.data()!.locations : []).find(
        (l: { id?: string }) => l.id === scheduled!.locationId
      );
      tx.set(entryRef, {
        orgId,
        teacherId,
        shiftId,
        date,
        weekStart,
        startAt: Timestamp.fromMillis(startAt),
        endAt: Timestamp.fromMillis(endAt),
        timezone,
        locationId: scheduled!.locationId,
        locationName: location?.name ?? 'Location removed',
        status: 'done',
        segments,
        endedBy: 'admin',
        workedMinutes: worked,
        correction,
        original: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { entryId: entryRef.id };
});

// ─── Close-out ───────────────────────────────────────────────────────────

/**
 * End every shift whose time is up. Hours are already capped at the shift's
 * end on read, so this only makes the record final; a dead phone at 5 PM
 * still gives exactly the scheduled hour. `openUntil` exists only on open
 * entries, so this single-field range query needs no composite index.
 */
export async function closeFinishedShifts(now = Date.now()): Promise<number> {
  const due = await db()
    .collection('timeEntries')
    .where('openUntil', '<=', Timestamp.fromMillis(now))
    .limit(300)
    .get();

  let closed = 0;
  for (const doc of due.docs) {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const entry = snap.data() as TimeEntry | undefined;
      if (!entry || entry.status === 'done') return;
      const lock = await getLock(tx, entry.teacherId);
      closeEntry(tx, doc.ref, entry, entry.endAt.toMillis(), 'schedule', lock);
      closed++;
    });
  }
  return closed;
}

export const closeFinishedShiftsJob = onSchedule(
  { schedule: 'every 5 minutes', region: REGION },
  async () => {
    const closed = await closeFinishedShifts();
    if (closed > 0) console.log(`Closed ${closed} finished shift(s).`);
  }
);
