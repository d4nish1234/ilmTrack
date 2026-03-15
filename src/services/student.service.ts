import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import { Student, CreateStudentData, UpdateStudentData, Parent, User } from '../types';
import { incrementStudentCount, decrementStudentCount, getClass } from './class.service';
import { unlinkAllParentsFromStudent } from '../utils/parentLinkCleanup';

const studentsRef = collection(firestore, 'students');

/**
 * Extract accepted parent userIds from a student's parents array.
 */
export function getParentUserIds(parents: Parent[]): string[] {
  return parents
    .filter((p) => p.userId && p.inviteStatus === 'accepted')
    .map((p) => p.userId!);
}

/**
 * Get all teacher userIds who should have access to docs in this class.
 * Includes the class owner AND all accepted invited teachers.
 */
export async function getInvitedTeacherIds(classId: string): Promise<string[]> {
  const classDoc = await getClass(classId);
  if (!classDoc) return [];
  const teacherIds: string[] = [classDoc.teacherId];
  for (const a of classDoc.admins || []) {
    if (a.userId && a.inviteStatus === 'accepted') {
      teacherIds.push(a.userId);
    }
  }
  return teacherIds;
}

export async function createStudent(
  classId: string,
  teacherId: string,
  data: CreateStudentData
): Promise<string> {
  // Prepare parents with initial invite status
  const parents: Parent[] = data.parents.map((parent) => ({
    ...parent,
    email: parent.email.toLowerCase(),
    inviteStatus: 'pending' as const,
  }));

  // Get invited teacher IDs for this class
  const invitedTeacherIds = await getInvitedTeacherIds(classId);

  const docRef = await addDoc(studentsRef, {
    ...data,
    classId,
    teacherId,
    parents,
    parentUserIds: [],
    invitedTeacherIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment student count in class (non-blocking — don't fail the whole operation)
  try {
    await incrementStudentCount(classId);
  } catch (err) {
    console.error('Failed to increment student count:', err);
  }

  // Create invite documents for each parent (triggers Cloud Function)
  const invitesRef = collection(firestore, 'invites');
  for (const parent of parents) {
    try {
      await addDoc(invitesRef, {
        email: parent.email,
        studentId: docRef.id,
        teacherId,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(`Failed to create invite for ${parent.email}:`, err);
    }
  }

  return docRef.id;
}

export async function getStudents(classId: string, teacherId: string): Promise<Student[]> {
  const q = query(
    studentsRef,
    where('classId', '==', classId),
    where('teacherId', '==', teacherId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Student))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export function subscribeToStudents(
  classId: string,
  teacherId: string,
  onUpdate: (students: Student[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    studentsRef,
    where('classId', '==', classId),
    where('teacherId', '==', teacherId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const students = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Student))
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
      onUpdate(students);
    },
    (error) => {
      onError(error);
    }
  );
}

export function subscribeToStudentsAsAdmin(
  classId: string,
  adminUid: string,
  onUpdate: (students: Student[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    studentsRef,
    where('classId', '==', classId),
    where('invitedTeacherIds', 'array-contains', adminUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const students = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Student))
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
      onUpdate(students);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function getStudent(studentId: string): Promise<Student | null> {
  const docRef = doc(firestore, 'students', studentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Student;
}

export function subscribeToStudent(
  studentId: string,
  onUpdate: (student: Student | null) => void,
  onError: (error: Error) => void
): () => void {
  const docRef = doc(firestore, 'students', studentId);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate({ id: docSnap.id, ...docSnap.data() } as Student);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      onError(error);
    }
  );
}

export async function updateStudent(
  studentId: string,
  data: UpdateStudentData
): Promise<void> {
  const docRef = doc(firestore, 'students', studentId);

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  // If parents are being updated, recalculate parentUserIds
  if (data.parents) {
    updateData.parentUserIds = getParentUserIds(data.parents);
  }

  await updateDoc(docRef, updateData);
}

export async function deleteStudent(
  studentId: string,
  classId: string,
  teacherId: string
): Promise<void> {
  // Remove studentId from all linked parents' user documents
  await unlinkAllParentsFromStudent(studentId);

  // Delete all homework for this student (must include teacherId for rules)
  const homeworkRef = collection(firestore, 'homework');
  const homeworkQuery = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );
  const homeworkSnapshot = await getDocs(homeworkQuery);

  // Delete all attendance for this student (must include teacherId for rules)
  const attendanceRef = collection(firestore, 'attendance');
  const attendanceQuery = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );
  const attendanceSnapshot = await getDocs(attendanceQuery);

  const batch = writeBatch(firestore);

  homeworkSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  attendanceSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  const studentDocRef = doc(firestore, 'students', studentId);
  batch.delete(studentDocRef);

  await batch.commit();

  // Decrement student count
  await decrementStudentCount(classId);
}

export async function searchStudents(
  classId: string,
  teacherId: string,
  queryStr: string
): Promise<Student[]> {
  const students = await getStudents(classId, teacherId);
  const lowerQuery = queryStr.toLowerCase();

  return students.filter(
    (student) =>
      student.firstName.toLowerCase().includes(lowerQuery) ||
      student.lastName.toLowerCase().includes(lowerQuery)
  );
}

export async function getStudentsByParentEmail(
  email: string
): Promise<Student[]> {
  const q = query(
    studentsRef,
    where('parents', 'array-contains', { email: email.toLowerCase() })
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Student[];
}

// Look up invited parent info by email (for signup pre-fill)
export async function getInvitedParentInfo(
  email: string
): Promise<{ firstName: string; lastName: string } | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const invitesRef = collection(firestore, 'invites');
  const q = query(invitesRef, where('email', '==', normalizedEmail));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  // Get the first invite's student to find the parent name
  const invite = snapshot.docs[0].data();
  const studentDoc = await getDoc(doc(firestore, 'students', invite.studentId));

  if (!studentDoc.exists()) return null;

  const student = studentDoc.data() as Student;
  const parent = student.parents?.find(
    (p) => p.email.toLowerCase() === normalizedEmail
  );

  if (!parent) return null;

  return {
    firstName: parent.firstName,
    lastName: parent.lastName,
  };
}

// Get user info by ID (for looking up signed-up parent names)
export async function getUserById(userId: string): Promise<User | null> {
  const userDoc = await getDoc(doc(firestore, 'users', userId));
  if (!userDoc.exists()) return null;
  return { uid: userDoc.id, ...userDoc.data() } as User;
}

// Link an existing student to a new class by copying the student record
export async function linkExistingStudentToClass(
  studentId: string,
  newClassId: string
): Promise<string> {
  // Get the existing student
  const existingStudent = await getStudent(studentId);
  if (!existingStudent) {
    throw new Error('Student not found');
  }

  // Check if already in this class
  if (existingStudent.classId === newClassId) {
    throw new Error('Student is already in this class');
  }

  // Get parentUserIds from existing parents and invitedTeacherIds from new class
  const parentUserIds = getParentUserIds(existingStudent.parents || []);
  const invitedTeacherIds = await getInvitedTeacherIds(newClassId);

  // Create a new student record for this class with the same info
  const docRef = await addDoc(studentsRef, {
    firstName: existingStudent.firstName,
    lastName: existingStudent.lastName,
    classId: newClassId,
    teacherId: existingStudent.teacherId,
    parents: existingStudent.parents,
    parentUserIds,
    invitedTeacherIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newStudentId = docRef.id;

  // Increment student count in the new class (non-blocking)
  try {
    await incrementStudentCount(newClassId);
  } catch (err) {
    console.error('Failed to increment student count:', err);
  }

  // Handle parents: link already-signed-up parents directly, create invites for others
  const invitesRef = collection(firestore, 'invites');

  for (const parent of existingStudent.parents || []) {
    try {
      if (parent.userId && parent.inviteStatus === 'accepted') {
        // Parent already signed up - directly add new studentId to their profile
        const userRef = doc(firestore, 'users', parent.userId);
        await updateDoc(userRef, {
          studentIds: arrayUnion(newStudentId),
        });
      } else {
        // Parent hasn't signed up yet - create an invite for the new student record
        await addDoc(invitesRef, {
          email: parent.email,
          studentId: newStudentId,
          teacherId: existingStudent.teacherId,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(`Failed to process parent ${parent.email}:`, err);
    }
  }

  return newStudentId;
}
