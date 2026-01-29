import firestore from '@react-native-firebase/firestore';
import { Class, CreateClassData, UpdateClassData } from '../types';

const classesCollection = firestore().collection('classes');

export async function createClass(
  teacherId: string,
  data: CreateClassData
): Promise<string> {
  const docRef = await classesCollection.add({
    ...data,
    teacherId,
    studentCount: 0,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  // Add class ID to teacher's classIds array
  await firestore()
    .collection('users')
    .doc(teacherId)
    .update({
      classIds: firestore.FieldValue.arrayUnion(docRef.id),
    });

  return docRef.id;
}

export async function getClasses(teacherId: string): Promise<Class[]> {
  const snapshot = await classesCollection
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Class[];
}

export function subscribeToClasses(
  teacherId: string,
  onUpdate: (classes: Class[]) => void,
  onError: (error: Error) => void
): () => void {
  return classesCollection
    .where('teacherId', '==', teacherId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snapshot) => {
        const classes = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Class[];
        onUpdate(classes);
      },
      (error) => {
        onError(error);
      }
    );
}

export async function getClass(classId: string): Promise<Class | null> {
  const doc = await classesCollection.doc(classId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Class;
}

export async function updateClass(
  classId: string,
  data: UpdateClassData
): Promise<void> {
  await classesCollection.doc(classId).update({
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteClass(
  classId: string,
  teacherId: string
): Promise<void> {
  // Remove class ID from teacher's classIds array
  await firestore()
    .collection('users')
    .doc(teacherId)
    .update({
      classIds: firestore.FieldValue.arrayRemove(classId),
    });

  // Delete all students in the class
  const studentsSnapshot = await firestore()
    .collection('students')
    .where('classId', '==', classId)
    .get();

  const batch = firestore().batch();
  studentsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Delete the class
  batch.delete(classesCollection.doc(classId));

  await batch.commit();
}

export async function incrementStudentCount(classId: string): Promise<void> {
  await classesCollection.doc(classId).update({
    studentCount: firestore.FieldValue.increment(1),
  });
}

export async function decrementStudentCount(classId: string): Promise<void> {
  await classesCollection.doc(classId).update({
    studentCount: firestore.FieldValue.increment(-1),
  });
}
