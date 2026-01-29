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
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { Student, CreateStudentData, UpdateStudentData, Parent } from '../types';
import { incrementStudentCount, decrementStudentCount } from './class.service';

const studentsRef = collection(firestore, 'students');

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

  const docRef = await addDoc(studentsRef, {
    ...data,
    classId,
    teacherId,
    parents,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment student count in class
  await incrementStudentCount(classId);

  // Create invite documents for each parent (triggers Cloud Function)
  const invitesRef = collection(firestore, 'invites');
  for (const parent of parents) {
    await addDoc(invitesRef, {
      email: parent.email,
      studentId: docRef.id,
      teacherId,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  return docRef.id;
}

export async function getStudents(classId: string): Promise<Student[]> {
  const q = query(
    studentsRef,
    where('classId', '==', classId),
    orderBy('lastName', 'asc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Student[];
}

export function subscribeToStudents(
  classId: string,
  onUpdate: (students: Student[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    studentsRef,
    where('classId', '==', classId),
    orderBy('lastName', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const students = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Student[];
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
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStudent(
  studentId: string,
  classId: string
): Promise<void> {
  // Delete all homework for this student
  const homeworkRef = collection(firestore, 'homework');
  const homeworkQuery = query(homeworkRef, where('studentId', '==', studentId));
  const homeworkSnapshot = await getDocs(homeworkQuery);

  // Delete all attendance for this student
  const attendanceRef = collection(firestore, 'attendance');
  const attendanceQuery = query(attendanceRef, where('studentId', '==', studentId));
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
  queryStr: string
): Promise<Student[]> {
  // For simple search, we fetch all and filter client-side
  // For production, consider using Algolia or similar
  const students = await getStudents(classId);
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
