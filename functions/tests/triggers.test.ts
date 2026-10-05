/**
 * Cloud Function triggers, invoked for real against the Firestore emulator.
 *
 *   cd .. && firebase emulators:start --only firestore
 *   cd functions && npm test
 *
 * These were previously verified only by hand. They are the functions that
 * rewrite access across every record in a class, and the step 4 migration
 * rewrites them heavily — which is the reason this harness exists.
 *
 * firebase-functions-test runs in offline mode: it builds the event payloads,
 * and the function's own Admin SDK writes land in the emulator, so what is
 * asserted is the resulting Firestore state rather than a mock.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import functionsTest from 'firebase-functions-test';

const PROJECT_ID = 'ilmtrack-functions-test';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const test = functionsTest({ projectId: PROJECT_ID });

// Imported after the env above, so the Admin SDK initializes against the emulator.
let fns: typeof import('../src/index');
let admin: typeof import('firebase-admin');
let db: FirebaseFirestore.Firestore;

const CLASS_ID = 'class-1';
const OWNER = 'owner-uid';
const NEW_TEACHER = 'new-teacher-uid';
const OLD_UID = 'deleted-uid';

async function clear() {
  await fetch(
    `http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

/** A class with `count` students plus one homework and one attendance doc. */
async function seed(count = 3, invited: string[] = [OWNER]) {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Hifz A',
    teacherId: OWNER,
    admins: [
      { email: 'new@example.com', userId: OLD_UID, inviteStatus: 'accepted' },
    ],
    adminUserIds: [OWNER, OLD_UID],
    studentCount: count,
  });

  for (let i = 0; i < count; i++) {
    await db.collection('students').doc(`s${i}`).set({
      firstName: 'S', lastName: `${i}`, classId: CLASS_ID, teacherId: OWNER,
      parents: [], parentUserIds: [], invitedTeacherIds: [...invited],
    });
  }
  await db.collection('homework').doc('hw1').set({
    studentId: 's0', classId: CLASS_ID, teacherId: OWNER,
    title: 'T', status: 'assigned', parentUserIds: [], invitedTeacherIds: [...invited],
  });
  await db.collection('attendance').doc('att1').set({
    studentId: 's0', classId: CLASS_ID, teacherId: OWNER,
    status: 'present', parentUserIds: [], invitedTeacherIds: [...invited],
  });
}

const invitedOn = async (col: string, id: string): Promise<string[]> =>
  ((await db.collection(col).doc(id).get()).data()?.invitedTeacherIds ?? []) as string[];

beforeAll(async () => {
  admin = await import('firebase-admin');
  fns = await import('../src/index');
  db = admin.firestore();
  await clear();
});

beforeEach(clear);
afterAll(() => test.cleanup());

describe('onTeacherInviteAccepted', () => {
  /** Build the before/after pair the trigger receives for an adminInvites write. */
  const change = (before: Record<string, unknown>, after: Record<string, unknown>) =>
    test.makeChange(
      test.firestore.makeDocumentSnapshot(before, 'adminInvites/ai1'),
      test.firestore.makeDocumentSnapshot(after, 'adminInvites/ai1')
    );

  const invite = (status: string, userId: string) => ({
    email: 'new@example.com', classId: CLASS_ID, status, userId,
  });

  it('backfills every record in the class when an invite is accepted', async () => {
    await seed();
    const wrapped = test.wrap(fns.onTeacherInviteAccepted);
    await wrapped({ data: change(invite('pending', NEW_TEACHER), invite('accepted', NEW_TEACHER)) });

    expect(await invitedOn('students', 's0')).toContain(NEW_TEACHER);
    expect(await invitedOn('students', 's2')).toContain(NEW_TEACHER);
    expect(await invitedOn('homework', 'hw1')).toContain(NEW_TEACHER);
    expect(await invitedOn('attendance', 'att1')).toContain(NEW_TEACHER);
  });

  it('repairs an already-accepted invite that is re-pointed at a new uid', async () => {
    // todo.md #7: an account deleted and recreated gets a new uid while the
    // invite still names the dead one. The old guard returned early on
    // before.status === 'accepted', so this could never fire again and one
    // co-teacher stayed invisible for four months.
    await seed(3, [OWNER, OLD_UID]);
    const wrapped = test.wrap(fns.onTeacherInviteAccepted);
    await wrapped({ data: change(invite('accepted', OLD_UID), invite('accepted', NEW_TEACHER)) });

    expect(await invitedOn('students', 's0')).toContain(NEW_TEACHER);
    const cls = (await db.collection('classes').doc(CLASS_ID).get()).data()!;
    expect(cls.admins[0].userId).toBe(NEW_TEACHER);
  });

  it('does nothing when an accepted invite is written unchanged', async () => {
    await seed();
    const wrapped = test.wrap(fns.onTeacherInviteAccepted);
    await wrapped({ data: change(invite('accepted', NEW_TEACHER), invite('accepted', NEW_TEACHER)) });

    expect(await invitedOn('students', 's0')).not.toContain(NEW_TEACHER);
  });

  it('does nothing while the invite is still pending', async () => {
    await seed();
    const wrapped = test.wrap(fns.onTeacherInviteAccepted);
    await wrapped({ data: change(invite('pending', NEW_TEACHER), invite('pending', NEW_TEACHER)) });

    expect(await invitedOn('students', 's0')).not.toContain(NEW_TEACHER);
  });
});

describe('onTeacherRemoved', () => {
  const classChange = (beforeAdmins: unknown[], afterAdmins: unknown[]) =>
    test.makeChange(
      test.firestore.makeDocumentSnapshot(
        { name: 'Hifz A', teacherId: OWNER, admins: beforeAdmins }, `classes/${CLASS_ID}`
      ),
      test.firestore.makeDocumentSnapshot(
        { name: 'Hifz A', teacherId: OWNER, admins: afterAdmins }, `classes/${CLASS_ID}`
      )
    );

  it('strips the removed teacher from every record in the class', async () => {
    await seed(3, [OWNER, NEW_TEACHER]);
    const wrapped = test.wrap(fns.onTeacherRemoved);
    await wrapped({
      data: classChange(
        [{ email: 'new@example.com', userId: NEW_TEACHER, inviteStatus: 'accepted' }],
        []
      ),
      params: { classId: CLASS_ID },
    });

    expect(await invitedOn('students', 's0')).toEqual([OWNER]);
    expect(await invitedOn('students', 's2')).toEqual([OWNER]);
    expect(await invitedOn('homework', 'hw1')).toEqual([OWNER]);
    expect(await invitedOn('attendance', 'att1')).toEqual([OWNER]);
  });

  it('leaves everyone else alone', async () => {
    await seed(2, [OWNER, NEW_TEACHER, 'other-uid']);
    const wrapped = test.wrap(fns.onTeacherRemoved);
    await wrapped({
      data: classChange(
        [{ email: 'new@example.com', userId: NEW_TEACHER, inviteStatus: 'accepted' }],
        []
      ),
      params: { classId: CLASS_ID },
    });

    const ids = await invitedOn('students', 's0');
    expect(ids).toContain('other-uid');
    expect(ids).not.toContain(NEW_TEACHER);
  });

  it('does nothing when the admins array is unchanged', async () => {
    await seed(2, [OWNER, NEW_TEACHER]);
    const admins = [{ email: 'new@example.com', userId: NEW_TEACHER, inviteStatus: 'accepted' }];
    const wrapped = test.wrap(fns.onTeacherRemoved);
    await wrapped({ data: classChange(admins, admins), params: { classId: CLASS_ID } });

    expect(await invitedOn('students', 's0')).toContain(NEW_TEACHER);
  });
});
