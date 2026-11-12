/**
 * The schedule-template callables, invoked for real against the Firestore
 * emulator (see timeclock.test.ts for how to run them).
 *
 * The org is in UTC. "Now" is Tuesday 2026-11-10 at noon unless a test moves
 * it. The template runs Mon–Thu 16:00–18:00 from Monday the 9th to Thursday
 * the 26th: three weeks, the first already partly past.
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
const ADMIN = 'admin-uid';
const T1 = 'teacher1';
const T2 = 'teacher2';
const STRANGER = 'stranger-uid';
const W1 = '2026-11-09';
const W2 = '2026-11-16';
const W3 = '2026-11-23';
const NOW = new Date('2026-11-10T12:00:00.000Z');
const SCHOOL = { latitude: 43.7, longitude: -79.7 };

type Result = {
  templateId: string;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  teachers: { teacherId: string; added: number; removed: number; skipped: { date: string; reason: string }[] }[];
};

beforeAll(async () => {
  const admin = await import('firebase-admin');
  fns = await import('../src/index');
  db = admin.firestore();
});

beforeEach(async () => {
  await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await db.collection('organizations').doc(ORG).set({ name: 'Test School', memberUserIds: [ADMIN] });
  await db.collection('timekeeping').doc(ORG).set({
    orgId: ORG,
    enabled: true,
    timezone: 'UTC',
    weekStartsOn: 1,
    locations: [{ id: 'loc1', name: 'Main campus', ...SCHOOL, radiusM: 150 }],
  });
  // T1 owns a class; T2 only co-teaches one, and isn't otherwise in the org.
  await db.collection('classes').doc('c1').set({ name: 'Hifz A', teacherId: T1, adminUserIds: [T1], orgId: ORG });
  await db.collection('classes').doc('c2').set({ name: 'Hifz B', teacherId: 'owner2', adminUserIds: ['owner2', T2], orgId: ORG });
});

afterEach(() => vi.useRealTimers());
afterAll(() => test.cleanup());

type Wrapped = (req: unknown) => Promise<unknown>;
const call = (fn: unknown, uid: string, data: object) =>
  (test.wrap(fn as never) as unknown as Wrapped)({ data, auth: { uid, token: {} } });

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; message: string };
    return { code: e.code, message: e.message };
  }
  throw new Error('expected the call to be refused');
}

const template = (over: object = {}) => ({
  name: 'Term 1',
  startDate: W1,
  endDate: '2026-11-26',
  slots: [{ id: 'a', days: [1, 2, 3, 4], start: '16:00', end: '18:00', locationId: 'loc1' }],
  teacherIds: [T1, T2],
  ...over,
});

const templateRef = (id: string) => db.collection('scheduleTemplates').doc(id);
const versionOf = async (id: string) => (await templateRef(id).get()).data()?.updatedAt?.toMillis();

/** Save as the app does: an edit sends the version it opened (the stored one, unless `extra` says otherwise). */
const save = async (over: object = {}, dryRun = false, uid = ADMIN, extra: object = {}) => {
  const id = (over as { id?: string }).id;
  const expectedUpdatedAt = id ? await versionOf(id) : undefined;
  return call(fns.saveScheduleTemplate, uid, {
    orgId: ORG,
    template: template(over),
    dryRun,
    ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    ...extra,
  }) as Promise<Result>;
};

const remove = (templateId: string, dryRun = false) =>
  call(fns.deleteScheduleTemplate, ADMIN, { orgId: ORG, templateId, dryRun }) as Promise<Result>;

const week = async (teacher: string, weekStart: string) =>
  (await db.collection('schedules').doc(`${ORG}_${teacher}_${weekStart}`).get()).data();

const dates = async (teacher: string, weekStart: string) =>
  ((await week(teacher, weekStart))?.shifts ?? []).map((s: { date: string }) => s.date);

describe('saveScheduleTemplate', () => {
  it("writes the template into every teacher's weeks from now on", async () => {
    const r = await save();
    expect(r).toMatchObject({ added: 22, updated: 0, removed: 0, skipped: 0 }); // 11 each

    // Monday the 9th is past: not written. Today's 4 PM shift is still ahead.
    expect(await dates(T1, W1)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(await dates(T1, W2)).toHaveLength(4);
    expect(await dates(T2, W3)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);

    const w = await week(T1, W1);
    expect(w).toMatchObject({ orgId: ORG, teacherId: T1, weekStart: W1, updatedBy: ADMIN });
    expect(w!.shifts[0]).toEqual({
      id: `${r.templateId}-a-2026-11-10`,
      date: '2026-11-10', start: '16:00', end: '18:00', locationId: 'loc1', templateId: r.templateId,
    });

    const stored = (await db.collection('scheduleTemplates').doc(r.templateId).get()).data();
    expect(stored).toMatchObject({ orgId: ORG, name: 'Term 1', teacherIds: [T1, T2], createdBy: ADMIN });
  });

  it('starts at its start date when that is still ahead', async () => {
    const r = await save({ startDate: W3 });
    expect(r.added).toBe(8);
    expect(await dates(T1, W2)).toEqual([]);
    expect(await dates(T1, W3)).toHaveLength(4);
  });

  it('previews without writing anything', async () => {
    const r = await save({}, true);
    expect(r.added).toBe(22);
    expect(await week(T1, W1)).toBeUndefined();
    expect((await db.collection('scheduleTemplates').get()).empty).toBe(true);
  });

  it('changes nothing when saved again unchanged', async () => {
    const { templateId } = await save();
    const again = await save({ id: templateId });
    expect(again).toMatchObject({ added: 0, updated: 0, removed: 0, teachers: [] });
  });

  it("updates future shifts in place when the times change, leaving one that's started", async () => {
    const { templateId } = await save();
    vi.setSystemTime(new Date('2026-11-10T15:50:00.000Z')); // today's shift can be started now
    const r = await save({ id: templateId, slots: [{ id: 'a', days: [1, 2, 3, 4], start: '15:00', end: '17:00', locationId: 'loc1' }] });

    expect(r.updated).toBe(20); // 11 each, minus today's
    const [today, tomorrow] = (await week(T1, W1))!.shifts;
    expect(today).toMatchObject({ date: '2026-11-10', start: '16:00' });
    expect(tomorrow).toMatchObject({ id: `${templateId}-a-2026-11-11`, start: '15:00' });
  });

  it('removes future shifts from a teacher taken off it, and only theirs', async () => {
    const { templateId } = await save();
    const r = await save({ id: templateId, teacherIds: [T1] });
    expect(r).toMatchObject({ removed: 11, added: 0 });
    expect(await dates(T2, W2)).toEqual([]);
    expect(await dates(T1, W2)).toHaveLength(4);
  });

  it('removes the weeks it no longer covers when the end date moves earlier', async () => {
    const { templateId } = await save();
    await save({ id: templateId, endDate: '2026-11-18' });
    expect(await dates(T1, W2)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(await dates(T1, W3)).toEqual([]);
  });

  it("doesn't overwrite a shift added by hand; it skips the template's and says so", async () => {
    await db.collection('schedules').doc(`${ORG}_${T1}_${W2}`).set({
      orgId: ORG, teacherId: T1, weekStart: W2,
      shifts: [{ id: 'mine', date: '2026-11-17', start: '17:00', end: '19:00', locationId: 'loc1' }],
    });
    const r = await save();
    expect(r.skipped).toBe(1);
    expect(r.teachers.find((t) => t.teacherId === T1)!.skipped).toEqual([
      { date: '2026-11-17', start: '16:00', end: '18:00', reason: 'overlap' },
    ]);
    const shifts = (await week(T1, W2))!.shifts;
    expect(shifts.find((s: { date: string }) => s.date === '2026-11-17')).toMatchObject({ id: 'mine' });
  });

  it('keeps a day edited or deleted by hand as the admin left it', async () => {
    const { templateId } = await save();
    const ref = db.collection('schedules').doc(`${ORG}_${T1}_${W2}`);
    const shifts = (await ref.get()).data()!.shifts as { id: string; date: string; templateId?: string; start: string }[];
    // Monday edited for that day only (templateId dropped); Tuesday deleted for that day only.
    const monday = { ...shifts[0], start: '16:30' };
    delete monday.templateId;
    await ref.update({
      shifts: [monday, ...shifts.slice(2)],
      skippedTemplateShifts: [shifts[1].id],
    });

    await save({ id: templateId, slots: [{ id: 'a', days: [1, 2, 3, 4], start: '15:00', end: '17:00', locationId: 'loc1' }] });
    const after = (await ref.get()).data()!;
    expect(after.shifts.map((s: { date: string; start: string }) => `${s.date} ${s.start}`)).toEqual([
      '2026-11-16 16:30', // the hand edit stays
      '2026-11-18 15:00',
      '2026-11-19 15:00',
    ]);
    expect(after.skippedTemplateShifts).toEqual([shifts[1].id]); // kept by the merge
  });

  it('refuses anyone but an org admin', async () => {
    expect((await refusal(save({}, false, T1))).code).toBe('permission-denied');
    expect((await refusal(save({}, false, STRANGER))).code).toBe('permission-denied');
  });

  it("refuses an invalid template with a message for the admin", async () => {
    const r = await refusal(save({ slots: [{ id: 'a', days: [1], start: '16:00', end: '18:00', locationId: 'nowhere' }] }));
    expect(r).toEqual({ code: 'invalid-argument', message: 'Choose a location for each time.' });
  });

  it("refuses to change another org's template or one that's gone", async () => {
    await db.collection('scheduleTemplates').doc('elsewhere').set({ orgId: 'org2', name: 'X' });
    expect((await refusal(save({ id: 'elsewhere' }))).code).toBe('not-found');
    expect((await refusal(save({ id: 'missing' }))).code).toBe('not-found');
  });

  it('writes shifts the time clock can start', async () => {
    const { templateId } = await save();
    vi.setSystemTime(new Date('2026-11-10T16:05:00.000Z'));
    await call(fns.startShift, T1, {
      orgId: ORG,
      weekStart: W1,
      shiftId: `${templateId}-a-2026-11-10`,
      position: { ...SCHOOL, accuracy: 10 },
    });
    const entry = (await db.collection('timeEntries').doc(`${ORG}_${T1}_2026-11-10_${templateId}-a-2026-11-10`).get()).data();
    expect(entry).toMatchObject({ status: 'running', locationName: 'Main campus' });
  });
});

describe('saving again after an interrupted or competing save', () => {
  it('finishes taking someone off after an interrupted save', async () => {
    const { templateId } = await save();
    // As if the server stopped right after storing the new version: T2 is
    // off it, but their shifts are still in their weeks.
    await templateRef(templateId).update({
      teacherIds: [T1],
      pending: { teacherIds: [T1, T2], startDate: W1, endDate: '2026-11-26' },
    });
    expect(await dates(T2, W2)).toHaveLength(4);

    const r = await save({ id: templateId, teacherIds: [T1] });
    expect(r.removed).toBe(11);
    expect(await dates(T2, W2)).toEqual([]);
    expect((await templateRef(templateId).get()).data()!.pending).toBeUndefined();
  });

  it('finishes removing weeks it no longer covers after an interrupted save', async () => {
    const { templateId } = await save();
    await templateRef(templateId).update({
      endDate: '2026-11-18',
      pending: { teacherIds: [T1, T2], startDate: W1, endDate: '2026-11-26' },
    });
    await save({ id: templateId, endDate: '2026-11-18' });
    expect(await dates(T1, W3)).toEqual([]);
  });

  it('stores nothing extra once a save finishes', async () => {
    const { templateId } = await save();
    await save({ id: templateId, teacherIds: [T1], endDate: '2026-11-18' });
    expect(Object.keys((await templateRef(templateId).get()).data()!).sort()).toEqual([
      'createdAt', 'createdBy', 'endDate', 'name', 'orgId', 'slots', 'startDate', 'teacherIds', 'updatedAt', 'updatedBy',
    ]);
  });

  it("refuses to save over someone else's newer change, even as a preview", async () => {
    const { templateId } = await save();
    const opened = await versionOf(templateId);
    vi.setSystemTime(new Date('2026-11-10T12:01:00.000Z'));
    await save({ id: templateId, teacherIds: [T1] }); // another admin
    const stale = { expectedUpdatedAt: opened };
    for (const dryRun of [true, false]) {
      const r = await refusal(save({ id: templateId, name: 'Term 1 (old)' }, dryRun, ADMIN, stale));
      expect(r.code).toBe('failed-precondition');
    }
    expect((await templateRef(templateId).get()).data()!.teacherIds).toEqual([T1]);
  });

  it('accepts a retry of the same save, even with an old version', async () => {
    const { templateId } = await save();
    const r = await save({ id: templateId }, false, ADMIN, { expectedUpdatedAt: 1 });
    expect(r).toMatchObject({ added: 0, removed: 0 });
  });

  it("doesn't make a second template when a new one's save is retried", async () => {
    const extra = { create: true };
    const first = await save({ id: 'newTemplate1' }, false, ADMIN, extra);
    const again = await save({ id: 'newTemplate1' }, false, ADMIN, extra);
    expect(first).toMatchObject({ templateId: 'newTemplate1', added: 22 });
    expect(again).toMatchObject({ added: 0 });
    expect((await db.collection('scheduleTemplates').get()).size).toBe(1);
  });

  it("keeps today's shift at its old time when the new time has already passed", async () => {
    const { templateId } = await save();
    const r = await save({ id: templateId, slots: [{ id: 'a', days: [1, 2, 3, 4], start: '10:00', end: '11:00', locationId: 'loc1' }] });
    const [today, tomorrow] = (await week(T1, W1))!.shifts;
    expect(today).toMatchObject({ date: '2026-11-10', start: '16:00' });
    expect(tomorrow).toMatchObject({ date: '2026-11-11', start: '10:00' });
    expect(r.teachers.find((t) => t.teacherId === T1)!.skipped).toEqual([
      { date: '2026-11-10', start: '10:00', end: '11:00', reason: 'past' },
    ]);
  });
});

describe('who can be on a schedule', () => {
  it("accepts the org's admins, class owners and co-teachers", async () => {
    // A second admin (with a uid shaped like a real one) who teaches nothing.
    await db.collection('organizations').doc(ORG).update({ memberUserIds: [ADMIN, 'admin2'] });
    expect((await save({ teacherIds: ['admin2', T1, T2, 'owner2'] })).added).toBe(44);
  });

  it("refuses someone who isn't in the organization", async () => {
    const r = await refusal(save({ teacherIds: [T1, STRANGER] }));
    expect(r.code).toBe('invalid-argument');
    expect((await db.collection('scheduleTemplates').get()).empty).toBe(true);
  });

  it('still lets someone who has left be kept or taken off', async () => {
    const { templateId } = await save();
    await db.collection('classes').doc('c2').delete(); // T2 no longer co-teaches
    await save({ id: templateId, name: 'Term 1 again' }); // T2 kept: not checked
    expect((await save({ id: templateId, teacherIds: [T1] })).removed).toBe(11);
  });

  it('needs at least one person', async () => {
    expect(await refusal(save({ teacherIds: [] }))).toEqual({ code: 'invalid-argument', message: 'Choose at least one person.' });
  });
});

describe('deleteScheduleTemplate', () => {
  it("removes its future shifts and itself, keeping ones that have started", async () => {
    const { templateId } = await save();
    vi.setSystemTime(new Date('2026-11-10T16:05:00.000Z')); // today's shift is under way
    const r = await remove(templateId);
    expect(r.removed).toBe(20);
    expect(await dates(T1, W1)).toEqual(['2026-11-10']);
    expect(await dates(T2, W3)).toEqual([]);
    expect((await db.collection('scheduleTemplates').doc(templateId).get()).exists).toBe(false);
  });

  it('previews without removing anything', async () => {
    const { templateId } = await save();
    expect((await remove(templateId, true)).removed).toBe(22);
    expect(await dates(T1, W2)).toHaveLength(4);
    expect((await db.collection('scheduleTemplates').doc(templateId).get()).exists).toBe(true);
  });

  it('also removes what an interrupted save left behind', async () => {
    const { templateId } = await save();
    await templateRef(templateId).update({
      teacherIds: [T1],
      pending: { teacherIds: [T1, T2], startDate: W1, endDate: '2026-11-26' },
    });
    await remove(templateId);
    expect(await dates(T2, W2)).toEqual([]);
  });

  it("leaves shifts added by hand", async () => {
    const { templateId } = await save();
    const ref = db.collection('schedules').doc(`${ORG}_${T1}_${W3}`);
    const shifts = (await ref.get()).data()!.shifts;
    await ref.update({ shifts: [...shifts, { id: 'mine', date: '2026-11-27', start: '09:00', end: '10:00', locationId: 'loc1' }] });
    await remove(templateId);
    expect(await dates(T1, W3)).toEqual(['2026-11-27']);
  });
});
