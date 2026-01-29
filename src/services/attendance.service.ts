import firestore from '@react-native-firebase/firestore';
import { Attendance, CreateAttendanceData, UpdateAttendanceData } from '../types';

const attendanceCollection = firestore().collection('attendance');

export async function createAttendance(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateAttendanceData
): Promise<string> {
  const docRef = await attendanceCollection.add({
    studentId,
    classId,
    teacherId,
    date: firestore.Timestamp.fromDate(data.date),
    status: data.status,
    notes: data.notes || null,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

export async function getAttendance(studentId: string): Promise<Attendance[]> {
  const snapshot = await attendanceCollection
    .where('studentId', '==', studentId)
    .orderBy('date', 'desc')
    .get();

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
  return attendanceCollection
    .where('studentId', '==', studentId)
    .orderBy('date', 'desc')
    .onSnapshot(
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
  await attendanceCollection.doc(attendanceId).update({
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  await attendanceCollection.doc(attendanceId).delete();
}

export async function getAttendanceByDate(
  classId: string,
  date: Date
): Promise<Attendance[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const snapshot = await attendanceCollection
    .where('classId', '==', classId)
    .where('date', '>=', firestore.Timestamp.fromDate(startOfDay))
    .where('date', '<=', firestore.Timestamp.fromDate(endOfDay))
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Attendance[];
}
