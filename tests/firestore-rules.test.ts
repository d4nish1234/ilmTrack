import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let testEnv: RulesTestEnvironment;

const TEACHER_UID = 'teacher1';
const OTHER_TEACHER_UID = 'teacher2';
const INVITED_TEACHER_UID = 'invitedTeacher1';
const PARENT_UID = 'parent1';
const OTHER_PARENT_UID = 'parent2';
const CLASS_ID = 'class1';
const STUDENT_ID = 'student1';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ilmtrack-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed test data using admin context (bypasses rules)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Create user profiles
    await setDoc(doc(db, 'users', TEACHER_UID), {
      email: 'teacher@test.com',
      role: 'teacher',
      firstName: 'Test',
      lastName: 'Teacher',
      classIds: [CLASS_ID],
    });

    await setDoc(doc(db, 'users', OTHER_TEACHER_UID), {
      email: 'other@test.com',
      role: 'teacher',
      firstName: 'Other',
      lastName: 'Teacher',
      classIds: [],
    });

    await setDoc(doc(db, 'users', INVITED_TEACHER_UID), {
      email: 'invited@test.com',
      role: 'teacher',
      firstName: 'Invited',
      lastName: 'Teacher',
      adminClassIds: [CLASS_ID],
    });

    await setDoc(doc(db, 'users', PARENT_UID), {
      email: 'parent@test.com',
      role: 'parent',
      firstName: 'Test',
      lastName: 'Parent',
      studentIds: [STUDENT_ID],
    });

    await setDoc(doc(db, 'users', OTHER_PARENT_UID), {
      email: 'otherparent@test.com',
      role: 'parent',
      firstName: 'Other',
      lastName: 'Parent',
      studentIds: [],
    });

    // Create class
    await setDoc(doc(db, 'classes', CLASS_ID), {
      name: 'Test Class',
      teacherId: TEACHER_UID,
      admins: [
        { email: 'invited@test.com', userId: INVITED_TEACHER_UID, inviteStatus: 'accepted' },
      ],
      studentCount: 1,
    });

    // Create student
    await setDoc(doc(db, 'students', STUDENT_ID), {
      firstName: 'Test',
      lastName: 'Student',
      classId: CLASS_ID,
      teacherId: TEACHER_UID,
      parentUserIds: [PARENT_UID],
      invitedTeacherIds: [INVITED_TEACHER_UID],
      parents: [
        { email: 'parent@test.com', userId: PARENT_UID, inviteStatus: 'accepted', firstName: 'Test', lastName: 'Parent' },
      ],
    });

    // Create homework
    await setDoc(doc(db, 'homework', 'hw1'), {
      studentId: STUDENT_ID,
      classId: CLASS_ID,
      teacherId: TEACHER_UID,
      parentUserIds: [PARENT_UID],
      invitedTeacherIds: [INVITED_TEACHER_UID],
      title: 'Test Homework',
      status: 'assigned',
    });

    // Create attendance
    await setDoc(doc(db, 'attendance', 'att1'), {
      studentId: STUDENT_ID,
      classId: CLASS_ID,
      teacherId: TEACHER_UID,
      parentUserIds: [PARENT_UID],
      invitedTeacherIds: [INVITED_TEACHER_UID],
      status: 'present',
    });
  });
});

// ─── Students ──────────────────────────────────────────────────────────

describe('Students collection', () => {
  it('class owner can read their own students', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('class owner CANNOT read another teacher\'s students', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('parent can read linked student via parentUserIds', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('unlinked parent CANNOT read student', async () => {
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('invited teacher can read students via invitedTeacherIds', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('teacher can create student with correct teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'students', 'newStudent'), {
        firstName: 'New',
        lastName: 'Student',
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [],
        invitedTeacherIds: [],
        parents: [],
      })
    );
  });

  it('teacher CANNOT create student with wrong teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'students', 'newStudent'), {
        firstName: 'New',
        lastName: 'Student',
        classId: CLASS_ID,
        teacherId: OTHER_TEACHER_UID,
        parentUserIds: [],
        invitedTeacherIds: [],
        parents: [],
      })
    );
  });

  it('parent CANNOT write to students collection', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'students', STUDENT_ID), { firstName: 'Hacked' })
    );
  });

  it('unauthenticated user CANNOT read students', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });
});

// ─── Homework ──────────────────────────────────────────────────────────

describe('Homework collection', () => {
  it('class owner can read their own homework', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'homework', 'hw1')));
  });

  it('other teacher CANNOT read homework', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'homework', 'hw1')));
  });

  it('parent can read homework via parentUserIds', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'homework', 'hw1')));
  });

  it('unlinked parent CANNOT read homework', async () => {
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'homework', 'hw1')));
  });

  it('invited teacher can read homework via invitedTeacherIds', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'homework', 'hw1')));
  });

  it('parent CANNOT create homework', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'homework', 'hw2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: PARENT_UID,
        title: 'Hack',
        status: 'assigned',
      })
    );
  });

  it('parent CANNOT delete homework', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'homework', 'hw1')));
  });

  it('teacher can create homework with correct teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'homework', 'hw2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [PARENT_UID],
        invitedTeacherIds: [],
        title: 'New HW',
        status: 'assigned',
      })
    );
  });
});

// ─── Attendance ────────────────────────────────────────────────────────

describe('Attendance collection', () => {
  it('class owner can read their own attendance', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'attendance', 'att1')));
  });

  it('other teacher CANNOT read attendance', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'attendance', 'att1')));
  });

  it('parent can read attendance via parentUserIds', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'attendance', 'att1')));
  });

  it('unlinked parent CANNOT read attendance', async () => {
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'attendance', 'att1')));
  });

  it('parent CANNOT create attendance', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'attendance', 'att2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: PARENT_UID,
        status: 'present',
      })
    );
  });
});

// ─── Invites ───────────────────────────────────────────────────────────

describe('Invites collection', () => {
  it('authenticated user can create invites', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      addDoc(collection(db, 'invites'), {
        email: 'new@parent.com',
        studentId: STUDENT_ID,
        teacherId: TEACHER_UID,
        status: 'pending',
      })
    );
  });

  it('unauthenticated user CANNOT create invites', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'invites', 'inv1'), {
        email: 'new@parent.com',
        studentId: STUDENT_ID,
        teacherId: TEACHER_UID,
        status: 'pending',
      })
    );
  });
});

// ─── Classes ───────────────────────────────────────────────────────────

describe('Classes collection', () => {
  it('teacher can create class with own teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'classes', 'newClass'), {
        name: 'New Class',
        teacherId: TEACHER_UID,
        admins: [],
        studentCount: 0,
      })
    );
  });

  it('teacher CANNOT create class with another teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'classes', 'newClass'), {
        name: 'New Class',
        teacherId: OTHER_TEACHER_UID,
        admins: [],
        studentCount: 0,
      })
    );
  });

  it('class owner can update their class', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'classes', CLASS_ID), { name: 'Updated Name' })
    );
  });

  it('other teacher CANNOT delete the class', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'classes', CLASS_ID)));
  });
});
