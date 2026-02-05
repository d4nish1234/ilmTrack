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
import { Attendance, CreateAttendanceData, UpdateAttendanceData } from '../types';

const attendanceRef = collection(firestore, 'attendance');

export async function createAttendance(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateAttendanceData
): Promise<string> {
  const docRef = await addDoc(attendanceRef, {
    studentId,
    classId,
    teacherId,
    date: Timestamp.fromDate(data.date),
    status: data.status,
    notes: data.notes || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getAttendance(studentId: string): Promise<Attendance[]> {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Attendance[];
}

export function subscribeToAttendance(
  studentId: string,
  onUpdate: (attendance: Attendance[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    orderBy('date', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const attendance = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Attendance[];
      onUpdate(attendance);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function updateAttendance(
  attendanceId: string,
  data: UpdateAttendanceData
): Promise<void> {
  const docRef = doc(firestore, 'attendance', attendanceId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  const docRef = doc(firestore, 'attendance', attendanceId);
  await deleteDoc(docRef);
}

export async function getAttendanceByDate(
  classId: string,
  date: Date
): Promise<Attendance[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    attendanceRef,
    where('classId', '==', classId),
    where('date', '>=', Timestamp.fromDate(startOfDay)),
    where('date', '<=', Timestamp.fromDate(endOfDay))
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Attendance[];
}

export async function getStudentAttendanceForDate(
  studentId: string,
  date: Date
): Promise<Attendance | null> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('date', '>=', Timestamp.fromDate(startOfDay)),
    where('date', '<=', Timestamp.fromDate(endOfDay))
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Attendance;
}

export async function toggleAttendance(
  studentId: string,
  classId: string,
  teacherId: string,
  date: Date
): Promise<{ action: 'created' | 'updated'; status: 'present' | 'absent' }> {
  const existing = await getStudentAttendanceForDate(studentId, date);

  if (existing) {
    const newStatus = existing.status === 'present' ? 'absent' : 'present';
    await updateAttendance(existing.id, { status: newStatus });
    return { action: 'updated', status: newStatus };
  } else {
    await createAttendance(studentId, classId, teacherId, {
      date,
      status: 'present',
    });
    return { action: 'created', status: 'present' };
  }
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getAttendancePaginated(
  studentId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Attendance>> {
  let q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    orderBy('date', 'desc'),
    limit(pageSize + 1)
  );

  if (lastDoc) {
    q = query(
      attendanceRef,
      where('studentId', '==', studentId),
      orderBy('date', 'desc'),
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
    })) as Attendance[],
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}

export async function getAttendancePaginatedMultiStudent(
  studentIds: string[],
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Attendance>> {
  if (studentIds.length === 0) {
    return { data: [], lastDoc: null, hasMore: false };
  }

  let q = query(
    attendanceRef,
    where('studentId', 'in', studentIds),
    orderBy('date', 'desc'),
    limit(pageSize + 1)
  );

  if (lastDoc) {
    q = query(
      attendanceRef,
      where('studentId', 'in', studentIds),
      orderBy('date', 'desc'),
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
    })) as Attendance[],
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}
