import { Timestamp } from 'firebase/firestore';

export type HomeworkStatus = 'assigned' | 'completed' | 'incomplete' | 'late';

export interface Homework {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  dueDate?: Timestamp;
  status: HomeworkStatus;
  completedAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
