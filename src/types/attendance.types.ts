import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  date: FirebaseFirestoreTypes.Timestamp;
  status: AttendanceStatus;
  notes?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface CreateAttendanceData {
  date: Date;
  status: AttendanceStatus;
  notes?: string;
}

export interface UpdateAttendanceData {
  status?: AttendanceStatus;
  notes?: string;
}
