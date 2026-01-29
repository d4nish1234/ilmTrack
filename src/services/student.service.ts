import firestore from '@react-native-firebase/firestore';
import { Student, CreateStudentData, UpdateStudentData, Parent } from '../types';
import { incrementStudentCount, decrementStudentCount } from './class.service';

const studentsCollection = firestore().collection('students');

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

  const docRef = await studentsCollection.add({
    ...data,
    classId,
    teacherId,
    parents,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Increment student count in class
  await incrementStudentCount(classId);

  // Create invite documents for each parent (triggers Cloud Function)
  for (const parent of parents) {
    await firestore().collection('invites').add({
      email: parent.email,
      studentId: docRef.id,
      teacherId,
      status: 'pending',
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
  }

  return docRef.id;
}

export async function getStudents(classId: string): Promise<Student[]> {
  const snapshot = await studentsCollection
    .where('classId', '==', classId)
    .orderBy('lastName', 'asc')
    .get();

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
  return studentsCollection
    .where('classId', '==', classId)
    .orderBy('lastName', 'asc')
    .onSnapshot(
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
  const doc = await studentsCollection.doc(studentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Student;
}

export function subscribeToStudent(
  studentId: string,
  onUpdate: (student: Student | null) => void,
  onError: (error: Error) => void
): () => void {
  return studentsCollection.doc(studentId).onSnapshot(
    (doc) => {
      if (doc.exists) {
        onUpdate({ id: doc.id, ...doc.data() } as Student);
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
  await studentsCollection.doc(studentId).update({
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteStudent(
  studentId: string,
  classId: string
): Promise<void> {
  // Delete all homework for this student
  const homeworkSnapshot = await firestore()
    .collection('homework')
    .where('studentId', '==', studentId)
    .get();

  // Delete all attendance for this student
  const attendanceSnapshot = await firestore()
    .collection('attendance')
    .where('studentId', '==', studentId)
    .get();

  const batch = firestore().batch();

  homeworkSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  attendanceSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  batch.delete(studentsCollection.doc(studentId));

  await batch.commit();

  // Decrement student count
  await decrementStudentCount(classId);
}

export async function searchStudents(
  classId: string,
  query: string
): Promise<Student[]> {
  // For simple search, we fetch all and filter client-side
  // For production, consider using Algolia or similar
  const students = await getStudents(classId);
  const lowerQuery = query.toLowerCase();

  return students.filter(
    (student) =>
      student.firstName.toLowerCase().includes(lowerQuery) ||
      student.lastName.toLowerCase().includes(lowerQuery)
  );
}

export async function getStudentsByParentEmail(
  email: string
): Promise<Student[]> {
  const snapshot = await studentsCollection
    .where('parents', 'array-contains', { email: email.toLowerCase() })
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Student[];
}
