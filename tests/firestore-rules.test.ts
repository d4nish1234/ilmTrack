import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
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
      // Maintained by the syncClassAdminUserIds Cloud Function: owner +
      // accepted co-teachers. The rules read this instead of the caller's own
      // adminClassIds, which is what closed the escalation.
      adminUserIds: [TEACHER_UID, INVITED_TEACHER_UID],
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

  it('teacher can update their own student', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'students', STUDENT_ID), { firstName: 'Updated' })
    );
  });

  it('teacher can delete their own student', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('invited teacher can create student in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'students', 'adminStudent'), {
        firstName: 'Admin',
        lastName: 'Student',
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [],
        invitedTeacherIds: [INVITED_TEACHER_UID],
        parents: [],
      })
    );
  });

  it('invited teacher can update student in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'students', STUDENT_ID), { firstName: 'AdminEdited' })
    );
  });

  it('invited teacher can delete student in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('parent CANNOT update students', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'students', STUDENT_ID), { firstName: 'Hacked' })
    );
  });

  it('parent CANNOT delete students', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('other teacher CANNOT update student', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'students', STUDENT_ID), { firstName: 'Hacked' })
    );
  });

  it('other teacher CANNOT delete student', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('unauthenticated user CANNOT read students', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('unauthenticated user CANNOT create students', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'students', 'unauthStudent'), {
        firstName: 'No',
        lastName: 'Auth',
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [],
        invitedTeacherIds: [],
        parents: [],
      })
    );
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

  // NOTE: Firestore rules do NOT enforce role-based access on creates.
  // A parent who sets teacherId to their own UID would pass the rule
  // `request.resource.data.teacherId == request.auth.uid`.
  // This is enforced at the app/UI layer only. The test below verifies
  // that a parent cannot create homework for ANOTHER user's teacherId.
  it('parent CANNOT create homework with another user\'s teacherId', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'homework', 'hw2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
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

  it('teacher can update their own homework', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'homework', 'hw1'), { title: 'Updated HW' })
    );
  });

  it('teacher can delete their own homework', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'homework', 'hw1')));
  });

  it('invited teacher can create homework in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'homework', 'hw3'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [PARENT_UID],
        invitedTeacherIds: [INVITED_TEACHER_UID],
        title: 'Admin HW',
        status: 'assigned',
      })
    );
  });

  it('invited teacher can update homework in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'homework', 'hw1'), { title: 'Admin Updated' })
    );
  });

  it('invited teacher can delete homework in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'homework', 'hw1')));
  });

  it('parent CANNOT update homework', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'homework', 'hw1'), { title: 'Hacked' })
    );
  });

  it('other teacher CANNOT update homework', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'homework', 'hw1'), { title: 'Hacked' })
    );
  });

  it('other teacher CANNOT delete homework', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'homework', 'hw1')));
  });

  it('unauthenticated user CANNOT read homework', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'homework', 'hw1')));
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

  // NOTE: Same security gap as homework — rules don't check user role on create.
  // See comment in Homework collection tests.
  it('parent CANNOT create attendance with another user\'s teacherId', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'attendance', 'att2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        status: 'present',
      })
    );
  });

  it('invited teacher can read attendance via invitedTeacherIds', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'attendance', 'att1')));
  });

  it('teacher can create attendance with correct teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'attendance', 'att2'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [PARENT_UID],
        invitedTeacherIds: [INVITED_TEACHER_UID],
        status: 'present',
      })
    );
  });

  it('teacher can update their own attendance', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'attendance', 'att1'), { status: 'absent' })
    );
  });

  it('teacher can delete their own attendance', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'attendance', 'att1')));
  });

  it('invited teacher can create attendance in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'attendance', 'att3'), {
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        teacherId: TEACHER_UID,
        parentUserIds: [PARENT_UID],
        invitedTeacherIds: [INVITED_TEACHER_UID],
        status: 'late',
      })
    );
  });

  it('invited teacher can update attendance in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'attendance', 'att1'), { status: 'late' })
    );
  });

  it('invited teacher can delete attendance in shared class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'attendance', 'att1')));
  });

  it('parent CANNOT update attendance', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'attendance', 'att1'), { status: 'absent' })
    );
  });

  it('parent CANNOT delete attendance', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'attendance', 'att1')));
  });

  it('other teacher CANNOT update attendance', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'attendance', 'att1'), { status: 'absent' })
    );
  });

  it('other teacher CANNOT delete attendance', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'attendance', 'att1')));
  });

  it('unauthenticated user CANNOT read attendance', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'attendance', 'att1')));
  });
});

// ─── Invites ───────────────────────────────────────────────────────────

describe('Invites collection', () => {
  const invite = (extra = {}) => ({
    email: 'new@parent.com',
    studentId: STUDENT_ID,
    teacherId: TEACHER_UID,
    status: 'pending',
    ...extra,
  });

  it("the student's teacher can create invites", async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(addDoc(collection(db, 'invites'), invite()));
  });

  it('a co-teacher of the student can create invites', async () => {
    // The transfer flow copies the owner's id onto the invite even when a
    // co-teacher runs it, so this must pass with teacherId != the caller.
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(addDoc(collection(db, 'invites'), invite()));
  });

  it('a teacher with no relationship to the student CANNOT create an invite', async () => {
    // The forge: an invite carrying your own address and someone else's
    // studentId is all acceptParentInvites needs to link you to that child.
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      addDoc(collection(db, 'invites'), invite({ email: 'other@test.com', teacherId: OTHER_TEACHER_UID }))
    );
  });

  it('CANNOT create an invite naming a student that does not exist', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(addDoc(collection(db, 'invites'), invite({ studentId: 'no-such-student' })));
  });

  it('nobody can flip an invite to accepted — not even the student\'s teacher', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invites', 'inv1'), invite());
    });
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'invites', 'inv1'), { status: 'accepted' }));
  });

  it('the teacher can still delete an invite (withdrawing access)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invites', 'inv1'), invite());
    });
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'invites', 'inv1')));
  });

  it('unauthenticated user CANNOT create invites', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'invites', 'inv1'), invite()));
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

  it('class owner can delete their class', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'classes', CLASS_ID)));
  });

  it('invited teacher can still update the class, now via adminUserIds', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'classes', CLASS_ID), { name: 'Admin Updated' })
    );
  });

  it('other teacher CANNOT update the class', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'classes', CLASS_ID), { name: 'Hacked' })
    );
  });

  it('other teacher CANNOT delete the class', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'classes', CLASS_ID)));
  });

  it('invited teacher CANNOT delete the class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'classes', CLASS_ID)));
  });

  // NOTE: Same security gap as homework/attendance — rules don't check user role on create.
  // A parent setting teacherId to their own UID passes the rule. Enforced at app/UI layer.
  it('parent CANNOT create a class with another user\'s teacherId', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'classes', 'parentClass'), {
        name: 'Parent Class',
        teacherId: TEACHER_UID,
        admins: [],
        studentCount: 0,
      })
    );
  });

  it('any authenticated user can read classes', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'classes', CLASS_ID)));
  });

  it('unauthenticated user CANNOT read classes', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'classes', CLASS_ID)));
  });
});

// ─── Users ────────────────────────────────────────────────────────────

describe('Config collection (version gate)', () => {
  it('is readable WITHOUT signing in, so the gate can run before login', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'config', 'app'), { minSupportedVersion: '1.4' });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'config', 'app')));
  });

  it('cannot be written by a client, so nobody can lift their own block', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(setDoc(doc(db, 'config', 'app'), { minSupportedVersion: '0.0.1' }));
  });

  it('is not a hole into other collections', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
    await assertFails(getDoc(doc(db, 'classes', CLASS_ID)));
  });
});

describe('Users collection', () => {
  it('authenticated user can read any user profile', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', TEACHER_UID)));
  });

  it('user can create their own profile', async () => {
    const db = testEnv.authenticatedContext('newUser1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'newUser1'), {
        email: 'new@test.com',
        role: 'parent',
        firstName: 'New',
        lastName: 'User',
      })
    );
  });

  it('user CANNOT create another user\'s profile', async () => {
    const db = testEnv.authenticatedContext('newUser1').firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'someoneElse'), {
        email: 'fake@test.com',
        role: 'parent',
        firstName: 'Fake',
        lastName: 'User',
      })
    );
  });

  it('authenticated user can update any user profile', async () => {
    // Rules allow any authenticated user to update (for invite acceptance flows)
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', PARENT_UID), { firstName: 'Updated' })
    );
  });

  it('user can delete their own profile', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'users', PARENT_UID)));
  });

  it('user CANNOT delete another user\'s profile', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'users', TEACHER_UID)));
  });

  it('unauthenticated user CANNOT read user profiles', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', TEACHER_UID)));
  });

  it('unauthenticated user CANNOT create user profiles', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'unauth1'), {
        email: 'unauth@test.com',
        role: 'parent',
        firstName: 'No',
        lastName: 'Auth',
      })
    );
  });
});

// ─── AdminInvites ─────────────────────────────────────────────────────

describe('AdminInvites collection', () => {
  async function seedAdminInvite() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'adminInvites', 'ai1'), {
        email: 'invited@test.com',
        classId: CLASS_ID,
        status: 'pending',
      });
    });
  }

  /** A caller whose token carries a verified email, as the rules require. */
  const asVerified = (uid: string, email: string) =>
    testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();

  it('the class owner can create admin invites', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(
      addDoc(collection(db, 'adminInvites'), {
        email: 'coteacher@test.com',
        classId: CLASS_ID,
        status: 'pending',
      })
    );
  });

  it('an existing co-teacher can create admin invites', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(
      addDoc(collection(db, 'adminInvites'), {
        email: 'another@test.com',
        classId: CLASS_ID,
        status: 'pending',
      })
    );
  });

  it('someone with no relationship to the class CANNOT create an admin invite', async () => {
    // The forge: invite yourself to any class, let the app accept it on your
    // next sign-in, and onTeacherInviteAccepted grants you the whole class.
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      addDoc(collection(db, 'adminInvites'), {
        email: 'other@test.com',
        classId: CLASS_ID,
        status: 'pending',
      })
    );
  });

  it('authenticated user can read admin invites', async () => {
    // Seed an admin invite first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'adminInvites', 'ai1'), {
        email: 'invited@test.com',
        classId: CLASS_ID,
        status: 'pending',
      });
    });

    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'adminInvites', 'ai1')));
  });

  it('the invited teacher can accept their own invite', async () => {
    await seedAdminInvite();
    const db = asVerified(INVITED_TEACHER_UID, 'invited@test.com');
    await assertSucceeds(
      updateDoc(doc(db, 'adminInvites', 'ai1'), {
        status: 'accepted',
        userId: INVITED_TEACHER_UID,
        email: 'invited@test.com',
        classId: CLASS_ID,
      })
    );
  });

  it('CANNOT accept an invite addressed to someone else', async () => {
    await seedAdminInvite();
    const db = asVerified(OTHER_TEACHER_UID, 'other@test.com');
    await assertFails(
      updateDoc(doc(db, 'adminInvites', 'ai1'), {
        status: 'accepted',
        userId: OTHER_TEACHER_UID,
        email: 'invited@test.com',
        classId: CLASS_ID,
      })
    );
  });

  it('CANNOT accept an invite with an unverified email', async () => {
    // Firebase will mint an account for any address you type, so an
    // unverified token proves nothing — same reasoning as acceptParentInvites.
    await seedAdminInvite();
    const db = testEnv
      .authenticatedContext(INVITED_TEACHER_UID, { email: 'invited@test.com', email_verified: false })
      .firestore();
    await assertFails(
      updateDoc(doc(db, 'adminInvites', 'ai1'), {
        status: 'accepted',
        userId: INVITED_TEACHER_UID,
        email: 'invited@test.com',
        classId: CLASS_ID,
      })
    );
  });

  it('CANNOT accept on the real invitee\'s behalf but point it at yourself', async () => {
    await seedAdminInvite();
    const db = asVerified(INVITED_TEACHER_UID, 'invited@test.com');
    await assertFails(
      updateDoc(doc(db, 'adminInvites', 'ai1'), {
        status: 'accepted',
        userId: OTHER_TEACHER_UID,
        email: 'invited@test.com',
        classId: CLASS_ID,
      })
    );
  });

  it('CANNOT repoint an invite at a different class while accepting it', async () => {
    await seedAdminInvite();
    const db = asVerified(INVITED_TEACHER_UID, 'invited@test.com');
    await assertFails(
      updateDoc(doc(db, 'adminInvites', 'ai1'), {
        status: 'accepted',
        userId: INVITED_TEACHER_UID,
        email: 'invited@test.com',
        classId: 'some-other-class',
      })
    );
  });

  it('authenticated user can delete admin invites', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'adminInvites', 'ai1'), {
        email: 'invited@test.com',
        classId: CLASS_ID,
        status: 'pending',
      });
    });

    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'adminInvites', 'ai1')));
  });

  it('unauthenticated user CANNOT create admin invites', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'adminInvites', 'ai2'), {
        email: 'hack@test.com',
        classId: CLASS_ID,
        status: 'pending',
      })
    );
  });

  it('unauthenticated user CANNOT read admin invites', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'adminInvites', 'ai1')));
  });
});

// ─── The removed fallback helpers must stay removed ───────────────────
//
// isLinkedParent() and isAdminOfClass() read studentIds / adminClassIds from
// the caller's OWN user document, which the caller can write — so any account
// could grant itself access to any class. They were deleted after an audit
// found no document relying on them. These tests are the regression lock:
// they assert the escalation now fails, and that the legitimate field-based
// paths still work.

describe('Escalation via self-written user profile is blocked', () => {
  it('injecting a studentId into my own profile does NOT grant student access', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'students', 'victimStudent'), {
        firstName: 'Victim', lastName: 'Student', classId: CLASS_ID,
        teacherId: TEACHER_UID, parents: [], parentUserIds: [], invitedTeacherIds: [TEACHER_UID],
      });
    });

    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', OTHER_PARENT_UID), {
      studentIds: ['victimStudent'],
    }));
    await assertFails(getDoc(doc(db, 'students', 'victimStudent')));
  });

  it('injecting a classId into my own profile does NOT grant class-wide access', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'homework', 'victimHw'), {
        studentId: STUDENT_ID, classId: CLASS_ID, teacherId: TEACHER_UID,
        title: 'Private', status: 'assigned', parentUserIds: [], invitedTeacherIds: [TEACHER_UID],
      });
      await setDoc(doc(db, 'attendance', 'victimAtt'), {
        studentId: STUDENT_ID, classId: CLASS_ID, teacherId: TEACHER_UID,
        status: 'present', parentUserIds: [], invitedTeacherIds: [TEACHER_UID],
      });
    });

    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', OTHER_PARENT_UID), {
      adminClassIds: [CLASS_ID],
    }));

    await assertFails(getDoc(doc(db, 'homework', 'victimHw')));
    await assertFails(getDoc(doc(db, 'attendance', 'victimAtt')));
    await assertFails(deleteDoc(doc(db, 'homework', 'victimHw')));
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('injecting a classId does NOT let me write the class doc and make it permanent', async () => {
    // The deepest part of the old exploit: class update was granted by
    // isAdminOfClass, so an attacker could add themselves to admins[] and
    // become a genuine co-teacher everywhere, including in ilmtrack-admin.
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', OTHER_PARENT_UID), {
      adminClassIds: [CLASS_ID],
    }));
    await assertFails(updateDoc(doc(db, 'classes', CLASS_ID), {
      admins: [{ email: 'otherparent@test.com', userId: OTHER_PARENT_UID, inviteStatus: 'accepted' }],
    }));
  });

  it('a document missing invitedTeacherIds is now unreadable, not fallback-readable', async () => {
    // The behaviour the fallback existed for. Production has no such document
    // (audited: 0 of 1,417), so this closing off is intentional.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'students', 'legacyStudent'), {
        firstName: 'Legacy', lastName: 'Student', classId: CLASS_ID,
        teacherId: TEACHER_UID, parents: [],
        // no invitedTeacherIds, no parentUserIds
      });
    });
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'students', 'legacyStudent')));
  });
});

describe('Legitimate access is unchanged', () => {
  it('owner still reads their student', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('accepted co-teacher still reads via invitedTeacherIds', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('linked parent still reads via parentUserIds', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('co-teacher can still bump studentCount when adding a student', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'classes', CLASS_ID), { studentCount: 2 }));
  });

  it('co-teacher CANNOT take ownership of the class', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'classes', CLASS_ID), {
      teacherId: INVITED_TEACHER_UID,
    }));
  });

  it('co-teacher CANNOT add another co-teacher', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'classes', CLASS_ID), {
      adminUserIds: [TEACHER_UID, INVITED_TEACHER_UID, OTHER_TEACHER_UID],
    }));
  });

  it('owner can still add a co-teacher', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'classes', CLASS_ID), {
      admins: [
        { email: 'invited@test.com', userId: INVITED_TEACHER_UID, inviteStatus: 'accepted' },
        { email: 'other@test.com', userId: OTHER_TEACHER_UID, inviteStatus: 'pending' },
      ],
    }));
  });

  it('a class with no adminUserIds yet denies co-teachers rather than erroring', async () => {
    // Ordering guard: the backfill must precede the rules deploy.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'classes', 'unbackfilled'), {
        name: 'Not Backfilled', teacherId: TEACHER_UID, studentCount: 0,
        admins: [{ email: 'invited@test.com', userId: INVITED_TEACHER_UID, inviteStatus: 'accepted' }],
      });
    });
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'classes', 'unbackfilled'), { name: 'x' }));

    const owner = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertSucceeds(updateDoc(doc(owner, 'classes', 'unbackfilled'), { name: 'x' }));
  });
});

// ─── List queries (security rules with where clauses) ─────────────────

describe('List queries with where clauses', () => {
  it('teacher can list students with where teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    const q = query(collection(db, 'students'), where('teacherId', '==', TEACHER_UID));
    await assertSucceeds(getDocs(q));
  });

  it('parent can list students with where parentUserIds array-contains', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    const q = query(collection(db, 'students'), where('parentUserIds', 'array-contains', PARENT_UID));
    await assertSucceeds(getDocs(q));
  });

  it('invited teacher can list students with where invitedTeacherIds array-contains', async () => {
    const db = testEnv.authenticatedContext(INVITED_TEACHER_UID).firestore();
    const q = query(collection(db, 'students'), where('invitedTeacherIds', 'array-contains', INVITED_TEACHER_UID));
    await assertSucceeds(getDocs(q));
  });

  it('teacher can list homework with where teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    const q = query(collection(db, 'homework'), where('teacherId', '==', TEACHER_UID));
    await assertSucceeds(getDocs(q));
  });

  it('parent can list homework with where parentUserIds array-contains', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    const q = query(collection(db, 'homework'), where('parentUserIds', 'array-contains', PARENT_UID));
    await assertSucceeds(getDocs(q));
  });

  it('teacher can list attendance with where teacherId', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    const q = query(collection(db, 'attendance'), where('teacherId', '==', TEACHER_UID));
    await assertSucceeds(getDocs(q));
  });

  it('parent can list attendance with where parentUserIds array-contains', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    const q = query(collection(db, 'attendance'), where('parentUserIds', 'array-contains', PARENT_UID));
    await assertSucceeds(getDocs(q));
  });

  // The static-satisfaction guarantee from CLAUDE.md: list queries MUST carry
  // a where clause matching the rules. An unconstrained list must fail.
  it('teacher CANNOT list students without a where clause', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(getDocs(query(collection(db, 'students'))));
  });

  it('teacher CANNOT list homework without a where clause', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(getDocs(query(collection(db, 'homework'))));
  });

  it('teacher CANNOT list attendance without a where clause', async () => {
    const db = testEnv.authenticatedContext(TEACHER_UID).firestore();
    await assertFails(getDocs(query(collection(db, 'attendance'))));
  });

  it('parent CANNOT list students with where teacherId == otherUid', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    const q = query(collection(db, 'students'), where('teacherId', '==', TEACHER_UID));
    await assertFails(getDocs(q));
  });

  it('parent CANNOT list students filtered by another parent\'s userId', async () => {
    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    const q = query(
      collection(db, 'students'),
      where('parentUserIds', 'array-contains', OTHER_PARENT_UID)
    );
    await assertFails(getDocs(q));
  });
});

// ─── Access revocation when arrays change ─────────────────────────────

describe('Parent access revocation', () => {
  it('removing parent from parentUserIds revokes student read access immediately', async () => {
    // Teacher removes the parent from the access array
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'students', STUDENT_ID), {
        parentUserIds: [],
        parents: [], // also drop from parents so isLinkedParent fallback doesn't help
      });
      // Also wipe studentIds on the parent user doc so the fallback fails too
      await updateDoc(doc(context.firestore(), 'users', PARENT_UID), {
        studentIds: [],
      });
    });

    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'students', STUDENT_ID)));
  });

  it('removing parent from parentUserIds on homework revokes read access', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'homework', 'hw1'), {
        parentUserIds: [],
      });
      // isLinkedParent fallback uses user.studentIds → studentId. Clear that too.
      await updateDoc(doc(context.firestore(), 'users', PARENT_UID), {
        studentIds: [],
      });
    });

    const db = testEnv.authenticatedContext(PARENT_UID).firestore();
    await assertFails(getDoc(doc(db, 'homework', 'hw1')));
  });
});

// ─── Known rules trade-offs (documenting current behaviour) ───────────
// These are the wide-open writes on `users`, `invites`, and `adminInvites`
// that CLAUDE.md describes — needed for Cloud-Function-driven flows.
// They are enforced at the app layer, not the rules layer. We assert
// the *current* permissive behaviour so a future tightening of the rules
// (or accidental loosening) gets flagged here.

describe('Known rules trade-offs', () => {
  it('any authenticated user CAN update another user\'s role (documented gap)', async () => {
    // This is the user-update wildcard rule. A malicious authenticated user
    // could promote themselves or others. Cloud Functions are the actual
    // gatekeeper for role transitions.
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', PARENT_UID), { role: 'teacher' }));
  });

  it('writing another user\'s studentIds/adminClassIds is still allowed, but now grants nothing', async () => {
    // Still permitted — the users rule stays open until roles move to custom
    // claims (todo.md #4). It is no longer a privilege escalation, because no
    // rule reads these arrays any more; they are UI hints. See the
    // "Escalation via self-written user profile is blocked" suite above.
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', PARENT_UID), {
        studentIds: ['injected-student'],
        adminClassIds: ['injected-class'],
      })
    );
  });

  it('CLOSED: flipping someone else\'s invite to "accepted" is now denied', async () => {
    // Was a documented gap. onInviteAccepted is an onDocumentUpdated trigger
    // with no request.auth, so it cannot verify a caller even in principle —
    // the gate had to move here. Invites are now immutable to clients.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invites', 'i1'), {
        email: 'someone@parent.com',
        studentId: STUDENT_ID,
        teacherId: TEACHER_UID,
        status: 'pending',
      });
    });
    const db = testEnv.authenticatedContext(OTHER_PARENT_UID).firestore();
    await assertFails(updateDoc(doc(db, 'invites', 'i1'), { status: 'accepted' }));
  });

  it('CLOSED: creating an adminInvite for a class you are not on is now denied', async () => {
    const db = testEnv.authenticatedContext(OTHER_TEACHER_UID).firestore();
    await assertFails(
      addDoc(collection(db, 'adminInvites'), {
        email: 'rogue@test.com',
        classId: CLASS_ID,
        status: 'pending',
      })
    );
  });
});
