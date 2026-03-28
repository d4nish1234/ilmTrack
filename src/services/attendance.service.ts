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
import { Attendance, CreateAttendanceData, UpdateAttendanceData } from '../types';

const attendanceRef = collection(firestore, 'attendance');

export async function createAttendance(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateAttendanceData,
  parentUserIds: string[] = [],
  invitedTeacherIds: string[] = []
): Promise<string> {
  const docRef = await addDoc(attendanceRef, {
    studentId,
    classId,
    teacherId,
    parentUserIds,
    invitedTeacherIds,
    date: Timestamp.fromDate(data.date),
    status: data.status,
    notes: data.notes || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getAttendance(studentId: string, teacherId: string): Promise<Attendance[]> {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as Attendance))
    .sort((a, b) => {
      const aTime = a.date?.toMillis?.() ?? 0;
      const bTime = b.date?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
}

export function subscribeToAttendance(
  studentId: string,
  teacherId: string,
  onUpdate: (attendance: Attendance[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const attendance = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Attendance))
        .sort((a, b) => {
          const aTime = a.date?.toMillis?.() ?? 0;
          const bTime = b.date?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
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
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }
  await updateDoc(docRef, updateData);
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  const docRef = doc(firestore, 'attendance', attendanceId);
  await deleteDoc(docRef);
}

export async function getAttendanceByDate(
  classId: string,
  callerUid: string,
  date: Date
): Promise<Attendance[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    attendanceRef,
    where('classId', '==', classId),
    where('invitedTeacherIds', 'array-contains', callerUid),
    where('date', '>=', Timestamp.fromDate(startOfDay)),
    where('date', '<=', Timestamp.fromDate(endOfDay))
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Attendance[];
}

export async function getStudentAttendanceForDate(
  studentId: string,
  callerUid: string,
  date: Date
): Promise<Attendance | null> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('invitedTeacherIds', 'array-contains', callerUid),
    where('date', '>=', Timestamp.fromDate(startOfDay)),
    where('date', '<=', Timestamp.fromDate(endOfDay))
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as Attendance;
}

export async function toggleAttendance(
  studentId: string,
  classId: string,
  teacherId: string,
  date: Date,
  parentUserIds: string[] = [],
  invitedTeacherIds: string[] = []
): Promise<{ action: 'created' | 'updated'; status: 'present' | 'absent' }> {
  const existing = await getStudentAttendanceForDate(studentId, teacherId, date);

  if (existing) {
    const newStatus = existing.status === 'present' ? 'absent' : 'present';
    await updateAttendance(existing.id, { status: newStatus });
    return { action: 'updated', status: newStatus };
  } else {
    await createAttendance(studentId, classId, teacherId, {
      date,
      status: 'present',
    }, parentUserIds, invitedTeacherIds);
    return { action: 'created', status: 'present' };
  }
}

// Teacher (owner or invited): query by invitedTeacherIds array-contains
// This shows ALL attendance for a student regardless of which teacher created it
export function subscribeToAttendanceAsTeacher(
  studentId: string,
  teacherUid: string,
  onUpdate: (attendance: Attendance[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('invitedTeacherIds', 'array-contains', teacherUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const attendance = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Attendance))
        .sort((a, b) => {
          const aTime = a.date?.toMillis?.() ?? 0;
          const bTime = b.date?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      onUpdate(attendance);
    },
    (error) => {
      onError(error);
    }
  );
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getAttendancePaginated(
  studentId: string,
  teacherId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Attendance>> {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('teacherId', '==', teacherId)
  );
  const snapshot = await getDocs(q);

  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Attendance }))
    .sort((a, b) => {
      const aTime = a.data.date?.toMillis?.() ?? 0;
      const bTime = b.data.date?.toMillis?.() ?? 0;
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

export async function getAttendancePaginatedAsTeacher(
  studentId: string,
  teacherUid: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Attendance>> {
  const q = query(
    attendanceRef,
    where('studentId', '==', studentId),
    where('invitedTeacherIds', 'array-contains', teacherUid)
  );
  const snapshot = await getDocs(q);

  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Attendance }))
    .sort((a, b) => {
      const aTime = a.data.date?.toMillis?.() ?? 0;
      const bTime = b.data.date?.toMillis?.() ?? 0;
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

export async function getAttendancePaginatedForParent(
  parentUserId: string,
  pageSize: number = 10,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<PaginatedResult<Attendance>> {
  const q = query(
    attendanceRef,
    where('parentUserIds', 'array-contains', parentUserId)
  );
  const snapshot = await getDocs(q);

  const allDocs = snapshot.docs
    .map((d) => ({ doc: d, data: { id: d.id, ...d.data() } as Attendance }))
    .sort((a, b) => {
      const aTime = a.data.date?.toMillis?.() ?? 0;
      const bTime = b.data.date?.toMillis?.() ?? 0;
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
