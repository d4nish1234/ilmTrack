import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { Class, CreateClassData, UpdateClassData } from '../types';

const classesRef = collection(firestore, 'classes');

export async function createClass(
  teacherId: string,
  data: CreateClassData
): Promise<string> {
  const docRef = await addDoc(classesRef, {
    ...data,
    teacherId,
    studentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Add class ID to teacher's classIds array
  const userRef = doc(firestore, 'users', teacherId);
  await updateDoc(userRef, {
    classIds: arrayUnion(docRef.id),
  });

  return docRef.id;
}

export async function getClasses(teacherId: string): Promise<Class[]> {
  const q = query(
    classesRef,
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

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
  const q = query(
    classesRef,
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
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
  const docRef = doc(firestore, 'classes', classId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Class;
}

export async function updateClass(
  classId: string,
  data: UpdateClassData
): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClass(
  classId: string,
  teacherId: string
): Promise<void> {
  // Remove class ID from teacher's classIds array
  const userRef = doc(firestore, 'users', teacherId);
  await updateDoc(userRef, {
    classIds: arrayRemove(classId),
  });

  // Delete all students in the class
  const studentsRef = collection(firestore, 'students');
  const studentsQuery = query(studentsRef, where('classId', '==', classId));
  const studentsSnapshot = await getDocs(studentsQuery);

  const batch = writeBatch(firestore);
  studentsSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  // Delete the class
  const classRef = doc(firestore, 'classes', classId);
  batch.delete(classRef);

  await batch.commit();
}

export async function incrementStudentCount(classId: string): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    studentCount: increment(1),
  });
}

export async function decrementStudentCount(classId: string): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    studentCount: increment(-1),
  });
}
