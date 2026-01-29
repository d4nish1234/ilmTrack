import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { Homework, CreateHomeworkData, UpdateHomeworkData } from '../types';

const homeworkRef = collection(firestore, 'homework');

export async function createHomework(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateHomeworkData
): Promise<string> {
  const docRef = await addDoc(homeworkRef, {
    studentId,
    classId,
    teacherId,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate
      ? Timestamp.fromDate(data.dueDate)
      : null,
    notes: data.notes || null,
    status: 'assigned',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getHomework(studentId: string): Promise<Homework[]> {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Homework[];
}

export function subscribeToHomework(
  studentId: string,
  onUpdate: (homework: Homework[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const homework = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Homework[];
      onUpdate(homework);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function updateHomework(
  homeworkId: string,
  data: UpdateHomeworkData
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.dueDate) {
    updateData.dueDate = Timestamp.fromDate(data.dueDate);
  }

  if (data.status === 'completed') {
    updateData.completedAt = serverTimestamp();
  }

  const docRef = doc(firestore, 'homework', homeworkId);
  await updateDoc(docRef, updateData);
}

export async function deleteHomework(homeworkId: string): Promise<void> {
  const docRef = doc(firestore, 'homework', homeworkId);
  await deleteDoc(docRef);
}
