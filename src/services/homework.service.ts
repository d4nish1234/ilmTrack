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
  onSnapshot,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { Homework, CreateHomeworkData, UpdateHomeworkData } from '../types';

const homeworkRef = collection(firestore, 'homework');

export async function createHomework(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateHomeworkData,
  parentUserIds: string[] = [],
  invitedTeacherIds: string[] = []
): Promise<string> {
  const docRef = await addDoc(homeworkRef, {
    studentId,
    classId,
    teacherId,
    parentUserIds,
    invitedTeacherIds,
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

export async function getHomework(studentId: string, teacherId: string): Promise<Homework[]> {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Homework))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
}

export function subscribeToHomework(
  studentId: string,
  teacherId: string,
  onUpdate: (homework: Homework[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const homework = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Homework))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
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
  teacherId: string,
  date: Date
): Promise<Homework[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId),
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
  teacherId: string,
  limitCount: number = 5
): Promise<Homework[]> {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId),
    where('status', '==', 'assigned')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Homework))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    })
    .slice(0, limitCount);
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getHomeworkPaginated(
  studentId: string,
  teacherId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Homework>> {
  const constraints = [
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId),
  ];

  const q = query(homeworkRef, ...constraints);
  const snapshot = await getDocs(q);

  // Sort client-side by createdAt desc
  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Homework }))
    .sort((a, b) => {
      const aTime = a.data.createdAt?.toMillis?.() ?? 0;
      const bTime = b.data.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

  // Find cursor position if lastDoc provided
  let startIndex = 0;
  if (lastDoc) {
    const cursorIndex = allDocs.findIndex((d) => d.doc.id === lastDoc.id);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const page = allDocs.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < allDocs.length;

  return {
    data: page.map((d) => d.data),
    lastDoc: page.length > 0 ? page[page.length - 1].doc : null,
    hasMore,
  };
}

// Teacher (owner or invited): query by invitedTeacherIds array-contains
// This shows ALL homework for a student regardless of which teacher created it
export function subscribeToHomeworkAsTeacher(
  studentId: string,
  teacherUid: string,
  onUpdate: (homework: Homework[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('invitedTeacherIds', 'array-contains', teacherUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const homework = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Homework))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      onUpdate(homework);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function getHomeworkPaginatedAsTeacher(
  studentId: string,
  teacherUid: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Homework>> {
  const q = query(
    homeworkRef,
    where('studentId', '==', studentId),
    where('invitedTeacherIds', 'array-contains', teacherUid)
  );
  const snapshot = await getDocs(q);

  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Homework }))
    .sort((a, b) => {
      const aTime = a.data.createdAt?.toMillis?.() ?? 0;
      const bTime = b.data.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

  let startIndex = 0;
  if (lastDoc) {
    const cursorIndex = allDocs.findIndex((d) => d.doc.id === lastDoc.id);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const page = allDocs.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < allDocs.length;

  return {
    data: page.map((d) => d.data),
    lastDoc: page.length > 0 ? page[page.length - 1].doc : null,
    hasMore,
  };
}

// Parent-specific: query by parentUserIds array-contains
export async function getHomeworkPaginatedForParent(
  parentUserId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Homework>> {
  const q = query(
    homeworkRef,
    where('parentUserIds', 'array-contains', parentUserId)
  );
  const snapshot = await getDocs(q);

  // Sort client-side by createdAt desc
  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Homework }))
    .sort((a, b) => {
      const aTime = a.data.createdAt?.toMillis?.() ?? 0;
      const bTime = b.data.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

  let startIndex = 0;
  if (lastDoc) {
    const cursorIndex = allDocs.findIndex((d) => d.doc.id === lastDoc.id);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const page = allDocs.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < allDocs.length;

  return {
    data: page.map((d) => d.data),
    lastDoc: page.length > 0 ? page[page.length - 1].doc : null,
    hasMore,
  };
}
