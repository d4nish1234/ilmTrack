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
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
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

export async function getHomeworkAssignedToday(
  studentId: string,
  date: Date
): Promise<Homework[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
    where('createdAt', '<=', Timestamp.fromDate(endOfDay))
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Homework[];
}

export async function getRecentPendingHomework(
  studentId: string,
  limitCount: number = 5
): Promise<Homework[]> {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('status', '==', 'assigned'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.slice(0, limitCount).map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Homework[];
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getHomeworkPaginated(
  studentId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Homework>> {
  let q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1) // Fetch one extra to check if there are more
  );

  if (lastDoc) {
    q = query(
      homeworkRef,
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize + 1)
    );
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  return {
    data: docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Homework[],
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}

export async function getHomeworkPaginatedMultiStudent(
  studentIds: string[],
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Homework>> {
  if (studentIds.length === 0) {
    return { data: [], lastDoc: null, hasMore: false };
  }

  let q = query(
    homeworkRef,
    where('studentId', 'in', studentIds),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1)
  );

  if (lastDoc) {
    q = query(
      homeworkRef,
      where('studentId', 'in', studentIds),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize + 1)
    );
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  return {
    data: docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Homework[],
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}
