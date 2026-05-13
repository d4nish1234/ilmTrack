/**
 * Tests the parent-link cleanup utility against the Firestore emulator.
 *
 * The utility imports `firestore` from `src/config/firebase`. We mock that
 * module to return a rules-unit-testing client bound to the emulator, so the
 * function runs against real Firestore semantics (queries, arrayRemove, etc.)
 * without needing the production Firebase project.
 *
 * Run requirements: the firestore emulator must be running on 127.0.0.1:8080
 * (matches firebase.json).
 */
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// `holder.firestore` is mutated in beforeAll once the testEnv is ready.
// `vi.hoisted` ensures the holder is available when the mock factory runs.
const holder = vi.hoisted(() => ({ firestore: null as any }));

vi.mock('../src/config/firebase', () => ({
  get firestore() {
    return holder.firestore;
  },
  functions: {},
}));

// Import AFTER the mock is registered.
import { unlinkParentsFromStudent, unlinkAllParentsFromStudent } from '../src/utils/parentLinkCleanup';
import type { Parent } from '../src/types';

let testEnv: RulesTestEnvironment;
// Use the teacher UID that owns the seeded student/invites. The cleanup
// helpers read the student doc (rules require teacherId match) and update
// user docs / invites (open to any authenticated user).
const TEACHER_UID = 't1';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ilmtrack-cleanup-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  // Pick any authenticated client — rules allow authenticated users to update
  // user docs and invites, which is all the cleanup function needs.
  holder.firestore = testEnv.authenticatedContext(TEACHER_UID).firestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const seed = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Parent users
    await setDoc(doc(db, 'users', 'parent-uid-1'), {
      email: 'a@parent.com',
      role: 'parent',
      studentIds: ['student-1', 'student-2'],
    });
    await setDoc(doc(db, 'users', 'parent-uid-2'), {
      email: 'b@parent.com',
      role: 'parent',
      studentIds: ['student-1'],
    });
    // Invites for both parents on student-1
    await addDoc(collection(db, 'invites'), {
      email: 'a@parent.com',
      studentId: 'student-1',
      teacherId: 't1',
      status: 'pending',
    });
    await addDoc(collection(db, 'invites'), {
      email: 'b@parent.com',
      studentId: 'student-1',
      teacherId: 't1',
      status: 'pending',
    });
    // Unrelated invite (different student) — must NOT be deleted
    await addDoc(collection(db, 'invites'), {
      email: 'a@parent.com',
      studentId: 'student-2',
      teacherId: 't1',
      status: 'pending',
    });
    // Student doc for unlinkAllParentsFromStudent
    await setDoc(doc(db, 'students', 'student-1'), {
      firstName: 'Test',
      lastName: 'Student',
      classId: 'c1',
      teacherId: 't1',
      parents: [
        { firstName: 'A', lastName: 'P', email: 'a@parent.com', userId: 'parent-uid-1', inviteStatus: 'accepted' },
        { firstName: 'B', lastName: 'P', email: 'b@parent.com', userId: 'parent-uid-2', inviteStatus: 'accepted' },
      ],
    });
  });
};

const adminDb = () => holder.firestore; // for read-back assertions

describe('unlinkParentsFromStudent', () => {
  it('removes studentId from each parent user doc', async () => {
    await seed();
    const parents: Parent[] = [
      { firstName: 'A', lastName: 'P', email: 'a@parent.com', userId: 'parent-uid-1', inviteStatus: 'accepted' },
      { firstName: 'B', lastName: 'P', email: 'b@parent.com', userId: 'parent-uid-2', inviteStatus: 'accepted' },
    ];

    await unlinkParentsFromStudent('student-1', parents);

    const p1 = await getDoc(doc(adminDb(), 'users', 'parent-uid-1'));
    const p2 = await getDoc(doc(adminDb(), 'users', 'parent-uid-2'));
    expect(p1.data()?.studentIds).toEqual(['student-2']); // student-1 removed
    expect(p2.data()?.studentIds).toEqual([]);
  });

  it('deletes only the matching invite docs for that student', async () => {
    await seed();
    const parents: Parent[] = [
      { firstName: 'A', lastName: 'P', email: 'a@parent.com', userId: 'parent-uid-1', inviteStatus: 'accepted' },
      { firstName: 'B', lastName: 'P', email: 'b@parent.com', userId: 'parent-uid-2', inviteStatus: 'accepted' },
    ];

    await unlinkParentsFromStudent('student-1', parents);

    const remaining = await getDocs(collection(adminDb(), 'invites'));
    const remainingDocs = remaining.docs.map((d) => d.data());
    expect(remainingDocs).toHaveLength(1);
    expect(remainingDocs[0]).toMatchObject({
      email: 'a@parent.com',
      studentId: 'student-2', // unrelated invite preserved
    });
  });

  it('falls back to looking up user by email when userId is missing', async () => {
    await seed();
    // Parent record without userId — function must look up via email
    const parents: Parent[] = [
      { firstName: 'A', lastName: 'P', email: 'a@parent.com', inviteStatus: 'pending' },
    ];

    await unlinkParentsFromStudent('student-1', parents);

    const p1 = await getDoc(doc(adminDb(), 'users', 'parent-uid-1'));
    expect(p1.data()?.studentIds).not.toContain('student-1');
  });

  it('lowercases email for invite lookup', async () => {
    await seed();
    // Caller passes uppercase email — must still match lowercase stored invites
    const parents: Parent[] = [
      { firstName: 'A', lastName: 'P', email: 'A@Parent.com', userId: 'parent-uid-1', inviteStatus: 'accepted' },
    ];
    await unlinkParentsFromStudent('student-1', parents);

    const invites = await getDocs(collection(adminDb(), 'invites'));
    const aInvitesForStudent1 = invites.docs
      .map((d) => d.data())
      .filter((d) => d.email === 'a@parent.com' && d.studentId === 'student-1');
    expect(aInvitesForStudent1).toHaveLength(0);
  });

  it('no-ops cleanly when parents array is empty', async () => {
    await seed();
    await expect(unlinkParentsFromStudent('student-1', [])).resolves.toBeUndefined();
    // Nothing should have changed
    const invites = await getDocs(collection(adminDb(), 'invites'));
    expect(invites.size).toBe(3);
  });

  it('swallows individual parent errors without failing the rest', async () => {
    await seed();
    // First parent points at a nonexistent user doc — updateDoc will throw,
    // but the loop must continue and still clean up parent 2.
    const parents: Parent[] = [
      { firstName: 'X', lastName: 'X', email: 'ghost@parent.com', userId: 'no-such-user', inviteStatus: 'accepted' },
      { firstName: 'B', lastName: 'P', email: 'b@parent.com', userId: 'parent-uid-2', inviteStatus: 'accepted' },
    ];
    // Silence the expected console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await unlinkParentsFromStudent('student-1', parents);

    const p2 = await getDoc(doc(adminDb(), 'users', 'parent-uid-2'));
    expect(p2.data()?.studentIds).toEqual([]);
  });
});

describe('unlinkAllParentsFromStudent', () => {
  it('reads parents from the student doc and unlinks them', async () => {
    await seed();
    await unlinkAllParentsFromStudent('student-1');

    const p1 = await getDoc(doc(adminDb(), 'users', 'parent-uid-1'));
    const p2 = await getDoc(doc(adminDb(), 'users', 'parent-uid-2'));
    expect(p1.data()?.studentIds).toEqual(['student-2']);
    expect(p2.data()?.studentIds).toEqual([]);

    const invites = await getDocs(collection(adminDb(), 'invites'));
    const forStudent1 = invites.docs.filter((d) => d.data().studentId === 'student-1');
    expect(forStudent1).toHaveLength(0);
  });

  it('is a no-op when the student doc does not exist', async () => {
    // No seed — just call and assert nothing throws
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(unlinkAllParentsFromStudent('does-not-exist')).resolves.toBeUndefined();
  });
});
