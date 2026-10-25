/**
 * The time-clock callables, invoked for real against the Firestore emulator.
 *
 *   cd .. && firebase emulators:start --only firestore
 *   cd functions && npm test
 *
 * Only `Date` is faked, so each test can stand at an exact moment relative to
 * the shift (the emulator's own timers are untouched).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import functionsTest from 'firebase-functions-test';

const PROJECT_ID = 'ilmtrack-functions-test';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const test = functionsTest({ projectId: PROJECT_ID });

let fns: typeof import('../src/index');
let db: FirebaseFirestore.Firestore;

const ORG = 'org1';
const ADMIN = 'admin-uid'; // administers ORG, teaches nothing
const TEACHER = 'teacher-uid'; // owns a class in ORG
const STRANGER = 'stranger-uid';
const WEEK = '2026-10-12';
const DATE = '2026-10-13';
const SCHOOL = { latitude: 43.7, longitude: -79.7 };
const AT_SCHOOL = { ...SCHOOL, accuracy: 15 };
const FAR_AWAY = { latitude: 43.72, longitude: -79.7, accuracy: 15 }; // ~2.2 km north
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00.000Z`); // the org is in UTC

async function clear() {
  await fetch(
    `http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

/** One org in UTC with a location, a class taught by TEACHER, and shifts. */
async function seed(shifts: object[] = [shift('s1', '16:00', '17:00')], enabled = true) {
  await db.collection('organizations').doc(ORG).set({
    name: 'Test School',
    members: [{ userId: ADMIN, email: 'a@x.com', role: 'owner' }],
    memberUserIds: [ADMIN],
  });
  await db.collection('timekeeping').doc(ORG).set({
    orgId: ORG,
    enabled,
    timezone: 'UTC',
    weekStartsOn: 1,
    locations: [{ id: 'loc1', name: 'Main campus', ...SCHOOL, radiusM: 150 }],
  });
  await db.collection('classes').doc('c1').set({
    name: 'Hifz A', teacherId: TEACHER, adminUserIds: [TEACHER], orgId: ORG, admins: [], studentCount: 0,
  });
  for (const uid of [TEACHER, ADMIN]) {
    await db.collection('schedules').doc(`${ORG}_${uid}_${WEEK}`).set({
      orgId: ORG, teacherId: uid, weekStart: WEEK, shifts,
    });
  }
}

function shift(id: string, start: string, end: string) {
  return { id, date: DATE, start, end, locationId: 'loc1', locationName: 'Main campus' };
}

type Wrapped = (req: unknown) => Promise<unknown>;
const call = (fn: unknown, uid: string, data: object) =>
  (test.wrap(fn as never) as unknown as Wrapped)({ data, auth: { uid, token: {} } });

/** The rejection's message and reason, for asserting on refusals. */
async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message: string; details?: { reason?: string } };
    return { code: e.code, message: e.message, reason: e.details?.reason };
  }
  throw new Error('expected the call to be refused');
}

const entryId = (uid = TEACHER, id = 's1') => `${ORG}_${uid}_${DATE}_${id}`;
const entry = async (id = entryId()) => (await db.collection('timeEntries').doc(id).get()).data()!;
const lock = async (uid = TEACHER) => (await db.collection('activeShifts').doc(uid).get()).data();

const start = (uid = TEACHER, position: object = AT_SCHOOL, shiftId = 's1') =>
  call(fns.startShift, uid, { orgId: ORG, weekStart: WEEK, shiftId, position });

beforeAll(async () => {
  const admin = await import('firebase-admin');
  fns = await import('../src/index');
  db = admin.firestore();
});

beforeEach(async () => {
  await clear();
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => test.cleanup());

describe('startShift', () => {
  it('starts at the school during the shift, and holds the lock', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start();

    const e = await entry();
    expect(e.status).toBe('running');
    expect(e.segments).toHaveLength(1);
    expect(e.openUntil.toMillis()).toBe(at('17:00').getTime());
    expect((await lock())?.entryId).toBe(entryId());
  });

  it('is harmless to start twice', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start();
    vi.setSystemTime(at('16:06'));
    await start();
    expect((await entry()).segments).toHaveLength(1);
  });

  it('opens 15 minutes early, not before', async () => {
    await seed();
    vi.setSystemTime(at('15:44'));
    const early = await refusal(start());
    expect(early.reason).toBe('too-early');
    expect(early.message).toBe('This shift opens 15 minutes before it starts.');
    vi.setSystemTime(at('15:45'));
    await start();
    expect((await entry()).status).toBe('running');
  });

  it('refuses once the shift is over', async () => {
    await seed();
    vi.setSystemTime(at('17:00'));
    expect((await refusal(start())).reason).toBe('finished');
  });

  it('refuses a reading clearly far from the school', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    const r = await refusal(start(TEACHER, FAR_AWAY));
    expect(r.reason).toBe('too-far');
    expect(r.message).toMatch(/about 2\.\d km from Main campus/);
  });

  it('lets a fuzzy reading near the school through', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start(TEACHER, { latitude: 43.7015, longitude: -79.7, accuracy: 400 });
    expect((await entry()).status).toBe('running');
  });

  it('refuses a mock location', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    expect((await refusal(start(TEACHER, { ...AT_SCHOOL, mocked: true }))).reason).toBe('mock-location');
  });

  it('stores nothing about where the teacher was', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start(TEACHER, { latitude: 43.7005, longitude: -79.7003, accuracy: 12 });
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    await call(fns.resumeShift, TEACHER, { entryId: entryId(), position: AT_SCHOOL });
    await call(fns.endShift, TEACHER, { entryId: entryId() });

    const stored = JSON.stringify([await entry(), await lock()]);
    for (const word of ['latitude', 'longitude', 'accuracy', 'distance', 'verdict', 'mocked', '43.7', 'checks', 'flags']) {
      expect(stored).not.toContain(word);
    }
  });

  it('lets an org admin who teaches nothing track their own shift', async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start(ADMIN);
    expect((await entry(entryId(ADMIN))).status).toBe('running');
  });

  it('refuses someone outside the organization', async () => {
    await seed();
    await db.collection('schedules').doc(`${ORG}_${STRANGER}_${WEEK}`).set({
      orgId: ORG, teacherId: STRANGER, weekStart: WEEK, shifts: [shift('s1', '16:00', '17:00')],
    });
    vi.setSystemTime(at('16:05'));
    expect((await refusal(start(STRANGER))).code).toBe('permission-denied');
  });

  it('refuses while timekeeping is off', async () => {
    await seed(undefined, false);
    vi.setSystemTime(at('16:05'));
    expect((await refusal(start())).message).toMatch(/turned off/);
  });

  it('allows only one open shift at a time', async () => {
    await seed([shift('s1', '16:00', '17:00'), shift('s2', '16:30', '18:00')]);
    vi.setSystemTime(at('16:35'));
    await start();
    expect((await refusal(start(TEACHER, AT_SCHOOL, 's2'))).reason).toBe('already-on-shift');
  });

  it('refuses a shift whose location was deleted', async () => {
    await seed();
    await db.collection('timekeeping').doc(ORG).update({ locations: [] });
    vi.setSystemTime(at('16:05'));
    expect((await refusal(start())).reason).toBe('no-location');
  });
});

describe('break, resume and end', () => {
  it('counts only the time worked', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:30'));
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    expect((await entry()).status).toBe('paused');
    vi.setSystemTime(at('16:40'));
    await call(fns.resumeShift, TEACHER, { entryId: entryId(), position: AT_SCHOOL });
    vi.setSystemTime(at('16:50'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });

    const e = await entry();
    expect(e.status).toBe('done');
    expect(e.endedBy).toBe('teacher');
    expect(e.workedMinutes).toBe(30);
    expect(e.openUntil).toBeUndefined();
    expect(await lock()).toBeUndefined();
  });

  it('does not count time before the scheduled start', async () => {
    await seed();
    vi.setSystemTime(at('15:50'));
    await start();
    vi.setSystemTime(at('16:20'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });
    expect((await entry()).workedMinutes).toBe(20);
  });

  it('refuses to resume far from school', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    expect((await refusal(call(fns.resumeShift, TEACHER, { entryId: entryId(), position: FAR_AWAY }))).reason).toBe('too-far');
  });

  it('ends without asking where the teacher is', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:40'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });
    const e = await entry();
    expect(e.status).toBe('done');
    expect(e.workedMinutes).toBe(30);
  });

  it('accepts an earlier offline end time, but never a later one', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:45'));
    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('16:30').getTime() });
    expect((await entry()).workedMinutes).toBe(20);

    await clear();
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:20'));
    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('16:59').getTime() });
    expect((await entry()).workedMinutes).toBe(10);
  });

  it('an offline End that arrives after the schedule closed the shift still shortens it', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    // Tapped End at 16:30 with no signal; still offline at 17:00 when the job runs.
    await fns.closeFinishedShifts(at('17:05').getTime());
    expect((await entry()).workedMinutes).toBe(50);

    vi.setSystemTime(at('17:20'));
    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('16:30').getTime() });
    const e = await entry();
    expect(e.workedMinutes).toBe(20);
    expect(e.endedBy).toBe('teacher');
    expect(e.segments[0].end.toMillis()).toBe(at('16:30').getTime());
  });

  it('a late offline End trims a break-split shift correctly', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:20'));
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    vi.setSystemTime(at('16:30'));
    await call(fns.resumeShift, TEACHER, { entryId: entryId(), position: AT_SCHOOL });
    await fns.closeFinishedShifts(at('17:05').getTime()); // 10 + 30 = 40 worked
    expect((await entry()).workedMinutes).toBe(40);

    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('16:40').getTime() });
    expect((await entry()).workedMinutes).toBe(20); // 16:10–16:20 and 16:30–16:40
  });

  it('a queued End can only shorten, never lengthen, a schedule-closed shift', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    await fns.closeFinishedShifts(at('17:05').getTime());
    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('18:00').getTime() });
    const e = await entry();
    expect(e.workedMinutes).toBe(50);
    expect(e.endedBy).toBe('schedule');
  });

  it("a teacher's own End is final: a later queued End doesn't change it", async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:40'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });
    await call(fns.endShift, TEACHER, { entryId: entryId(), endedAt: at('16:20').getTime() });
    expect((await entry()).workedMinutes).toBe(30);
  });

  it('is harmless to end twice', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:20'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });
    vi.setSystemTime(at('16:40'));
    await call(fns.endShift, TEACHER, { entryId: entryId() });
    expect((await entry()).workedMinutes).toBe(10);
  });

  it("refuses to resume someone else's shift without revealing anything about their org", async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    // Even with timekeeping off, the refusal must be about ownership, not the org.
    await db.collection('timekeeping').doc(ORG).update({ enabled: false });
    const r = await refusal(call(fns.resumeShift, STRANGER, { entryId: entryId(), position: AT_SCHOOL }));
    expect(r.code).toBe('permission-denied');
    expect(r.message).not.toMatch(/turned off|timekeeping/i);
  });

  it("refuses to touch someone else's shift", async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    expect((await refusal(call(fns.endShift, ADMIN, { entryId: entryId() }))).code).toBe('permission-denied');
  });

  it('saves a note', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    await call(fns.setShiftNote, TEACHER, { entryId: entryId(), note: '  Covered for Br. Ali  ' });
    expect((await entry()).note).toBe('Covered for Br. Ali');
  });
});

describe('closeFinishedShifts', () => {
  it('ends a forgotten shift at its scheduled end', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    expect(await fns.closeFinishedShifts(at('16:59').getTime())).toBe(0);
    expect(await fns.closeFinishedShifts(at('17:05').getTime())).toBe(1);

    const e = await entry();
    expect(e.status).toBe('done');
    expect(e.endedBy).toBe('schedule');
    expect(e.workedMinutes).toBe(50);
    expect(await lock()).toBeUndefined();
  });

  it('closes a shift left on break, counting only the time worked', async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('16:40'));
    await call(fns.pauseShift, TEACHER, { entryId: entryId() });
    await fns.closeFinishedShifts(at('17:05').getTime());
    expect((await entry()).workedMinutes).toBe(30);
  });

  it("keeps the next shift's lock when closing the previous one", async () => {
    await seed([shift('s1', '16:00', '17:00'), shift('s2', '17:00', '18:00')]);
    vi.setSystemTime(at('16:10'));
    await start();
    vi.setSystemTime(at('17:01'));
    await start(TEACHER, AT_SCHOOL, 's2'); // s1's lock has expired
    await fns.closeFinishedShifts(at('17:05').getTime());

    expect((await entry()).status).toBe('done');
    expect((await lock())?.entryId).toBe(entryId(TEACHER, 's2'));
  });
});

describe('getMyTimekeeping', () => {
  it("returns this week's shifts with the org and exact times", async () => {
    await seed([shift('s1', '16:00', '17:00')]);
    vi.setSystemTime(at('12:00'));
    const res = (await call(fns.getMyTimekeeping, TEACHER, {})) as {
      orgs: { orgName: string; today: string; weekStart: string; shifts: { startAt: number; locationName: string }[] }[];
    };
    expect(res.orgs).toHaveLength(1);
    expect(res.orgs[0].orgName).toBe('Test School');
    expect(res.orgs[0].today).toBe(DATE);
    expect(res.orgs[0].weekStart).toBe(WEEK);
    expect(res.orgs[0].shifts[0].startAt).toBe(at('16:00').getTime());
    expect(res.orgs[0].shifts[0].locationName).toBe('Main campus');
  });

  it('shows nothing while timekeeping is off, or to someone outside the org', async () => {
    await seed(undefined, false);
    vi.setSystemTime(at('12:00'));
    expect(((await call(fns.getMyTimekeeping, TEACHER, {})) as { orgs: unknown[] }).orgs).toEqual([]);

    await clear();
    await seed();
    await db.collection('schedules').doc(`${ORG}_${STRANGER}_${WEEK}`).set({
      orgId: ORG, teacherId: STRANGER, weekStart: WEEK, shifts: [shift('s1', '16:00', '17:00')],
    });
    expect(((await call(fns.getMyTimekeeping, STRANGER, {})) as { orgs: unknown[] }).orgs).toEqual([]);
  });

  it('includes an org they teach in, from the app\'s hint, even without shifts', async () => {
    await seed();
    await db.collection('schedules').doc(`${ORG}_${TEACHER}_${WEEK}`).delete();
    vi.setSystemTime(at('12:00'));
    const res = (await call(fns.getMyTimekeeping, TEACHER, { orgIds: [ORG] })) as {
      orgs: { orgId: string; shifts: unknown[] }[];
    };
    expect(res.orgs).toEqual([expect.objectContaining({ orgId: ORG, shifts: [] })]);
  });

  it('verifies hints: an org they have nothing to do with is left out', async () => {
    await seed();
    vi.setSystemTime(at('12:00'));
    const res = (await call(fns.getMyTimekeeping, STRANGER, { orgIds: [ORG] })) as { orgs: unknown[] };
    expect(res.orgs).toEqual([]);
  });

  it('ignores malformed hints and caps how many are checked', async () => {
    await seed();
    await db.collection('schedules').doc(`${ORG}_${TEACHER}_${WEEK}`).delete();
    vi.setSystemTime(at('12:00'));
    const junk = ['', 'has space', '../x', 42, null, 'x'.repeat(65)];
    const res1 = (await call(fns.getMyTimekeeping, TEACHER, { orgIds: junk })) as { orgs: unknown[] };
    expect(res1.orgs).toEqual([]);
    // The real org after 20 others is beyond the cap.
    const many = [...Array.from({ length: 20 }, (_, i) => `nosuchorg${i}`), ORG];
    const res2 = (await call(fns.getMyTimekeeping, TEACHER, { orgIds: many })) as { orgs: unknown[] };
    expect(res2.orgs).toEqual([]);
  });

  it('without a hint, an unscheduled teacher who only teaches in the org is not looked up', async () => {
    // The app sends hints from its classes; the server no longer reads every
    // class the teacher owns to find them.
    await seed();
    await db.collection('schedules').doc(`${ORG}_${TEACHER}_${WEEK}`).delete();
    vi.setSystemTime(at('12:00'));
    expect(((await call(fns.getMyTimekeeping, TEACHER, {})) as { orgs: unknown[] }).orgs).toEqual([]);
  });

  it('includes an org they only administer', async () => {
    await seed();
    await db.collection('schedules').doc(`${ORG}_${ADMIN}_${WEEK}`).delete();
    vi.setSystemTime(at('12:00'));
    const res = (await call(fns.getMyTimekeeping, ADMIN, {})) as { orgs: { orgId: string }[] };
    expect(res.orgs.map((o) => o.orgId)).toEqual([ORG]);
  });

  it('leaves out an org they teach in while its timekeeping is off', async () => {
    await seed([], false);
    vi.setSystemTime(at('12:00'));
    expect(((await call(fns.getMyTimekeeping, TEACHER, {})) as { orgs: unknown[] }).orgs).toEqual([]);
  });

  it('skips malformed shifts', async () => {
    await seed([shift('s1', '16:00', '17:00'), { id: 'bad', date: 'today', start: '9', end: '5' }]);
    vi.setSystemTime(at('12:00'));
    const res = (await call(fns.getMyTimekeeping, TEACHER, {})) as { orgs: { shifts: unknown[] }[] };
    expect(res.orgs[0].shifts).toHaveLength(1);
  });
});

describe('correctTimeEntry', () => {
  const correct = (uid: string, overrides: object = {}) =>
    call(fns.correctTimeEntry, uid, {
      orgId: ORG, teacherId: TEACHER, weekStart: WEEK, shiftId: 's1', date: DATE,
      start: '16:00', end: '16:30', reason: 'Forgot to end',
      ...overrides,
    });

  it("lets an org admin fix a forgotten End, keeping the teacher's own record", async () => {
    await seed();
    vi.setSystemTime(at('16:00'));
    await start();
    await fns.closeFinishedShifts(at('17:05').getTime()); // ran to the end: 60m
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN);

    const e = await entry();
    expect(e.workedMinutes).toBe(30);
    expect(e.endedBy).toBe('admin');
    expect(e.status).toBe('done');
    expect(e.correction).toMatchObject({ by: ADMIN, reason: 'Forgot to end' });
    expect(e.original).toMatchObject({ workedMinutes: 60, endedBy: 'schedule' });
    expect(e.original.segments).toHaveLength(1);
  });

  it('keeps the first original through later corrections', async () => {
    await seed();
    vi.setSystemTime(at('16:00'));
    await start();
    await fns.closeFinishedShifts(at('17:05').getTime());
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN, { end: '16:30' });
    await correct(ADMIN, { end: '16:45', reason: 'Actually left at 4:45' });

    const e = await entry();
    expect(e.workedMinutes).toBe(45);
    expect(e.correction.reason).toBe('Actually left at 4:45');
    expect(e.original.workedMinutes).toBe(60);
  });

  it('adds time for a shift the teacher never started', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN, { start: '16:05', end: '17:00', reason: 'Phone was dead' });

    const e = await entry();
    expect(e.workedMinutes).toBe(55);
    expect(e.status).toBe('done');
    expect(e.locationName).toBe('Main campus');
    expect(e.original).toBeNull();
  });

  it('refuses anyone but an org admin, including the teacher', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    expect((await refusal(correct(TEACHER))).code).toBe('permission-denied');
    expect((await refusal(correct(STRANGER))).code).toBe('permission-denied');
  });

  it('requires a reason', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    expect((await refusal(correct(ADMIN, { reason: '   ' }))).reason).toBe('no-reason');
  });

  it('keeps worked time within the shift', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    expect((await refusal(correct(ADMIN, { start: '15:30' }))).reason).toBe('outside-shift');
    expect((await refusal(correct(ADMIN, { end: '17:30' }))).reason).toBe('outside-shift');
    expect((await refusal(correct(ADMIN, { start: '16:30', end: '16:00' }))).code).toBe('invalid-argument');
  });

  it('allows longer hours once the admin extends the shift', async () => {
    await seed();
    vi.setSystemTime(at('16:00'));
    await start();
    await fns.closeFinishedShifts(at('17:05').getTime());
    await db.collection('schedules').doc(`${ORG}_${TEACHER}_${WEEK}`).update({
      shifts: [shift('s1', '16:00', '17:30')],
    });
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN, { end: '17:30', reason: 'Stayed for parents' });
    expect((await entry()).workedMinutes).toBe(90);
  });

  it("won't correct a shift that's still running", async () => {
    await seed();
    vi.setSystemTime(at('16:10'));
    await start();
    expect((await refusal(correct(ADMIN, { end: '16:05' }))).reason).toBe('still-running');
  });

  it("won't record time that hasn't happened", async () => {
    await seed();
    vi.setSystemTime(at('15:00'));
    expect((await refusal(correct(ADMIN))).code).toBe('invalid-argument');
  });

  it('corrects a shift that was deleted after it ran, within its recorded times', async () => {
    await seed();
    vi.setSystemTime(at('16:00'));
    await start();
    await fns.closeFinishedShifts(at('17:05').getTime());
    await db.collection('schedules').doc(`${ORG}_${TEACHER}_${WEEK}`).update({ shifts: [] });
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN, { end: '16:20' });
    expect((await entry()).workedMinutes).toBe(20);
    expect((await refusal(correct(ADMIN, { end: '17:30' }))).reason).toBe('outside-shift');
  });

  it("records the teacher's time when correcting a shift not yet closed out", async () => {
    await seed();
    vi.setSystemTime(at('16:05'));
    await start();
    // Past its end, but the close-out job hasn't run: no workedMinutes yet.
    vi.setSystemTime(at('17:02'));
    await correct(ADMIN, { end: '16:40' });
    const e = await entry();
    expect(e.original.workedMinutes).toBe(55);
    expect(e.workedMinutes).toBe(40);
    expect(e.openUntil).toBeUndefined();
  });

  it('refuses a week that does not hold the date', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    expect((await refusal(correct(ADMIN, { weekStart: '2026-10-19' }))).code).toBe('invalid-argument');
  });

  it("won't add time to a shift that is still on", async () => {
    await seed();
    vi.setSystemTime(at('16:30'));
    expect((await refusal(correct(ADMIN, { end: '16:20' }))).reason).toBe('not-over');
  });

  it("labels added time whose location was deleted", async () => {
    await seed();
    await db.collection('timekeeping').doc(ORG).update({ locations: [] });
    vi.setSystemTime(at('18:00'));
    await correct(ADMIN);
    expect((await entry()).locationName).toBe('Location removed');
  });

  it('refuses a shift that neither exists nor was ever worked', async () => {
    await seed();
    vi.setSystemTime(at('18:00'));
    expect((await refusal(correct(ADMIN, { shiftId: 'nope' }))).code).toBe('not-found');
  });
});
