import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type HomeworkStatus = 'assigned' | 'completed' | 'incomplete' | 'late';

export interface Homework {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  dueDate?: FirebaseFirestoreTypes.Timestamp;
  status: HomeworkStatus;
  completedAt?: FirebaseFirestoreTypes.Timestamp;
  notes?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface CreateHomeworkData {
  title: string;
  description?: string;
  dueDate?: Date;
  notes?: string;
}

export interface UpdateHomeworkData {
  title?: string;
  description?: string;
  dueDate?: Date;
  status?: HomeworkStatus;
  notes?: string;
}
