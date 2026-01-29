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
