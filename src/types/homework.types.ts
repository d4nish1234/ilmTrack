import { Timestamp } from 'firebase/firestore';

export type HomeworkStatus = 'assigned' | 'completed' | 'incomplete' | 'late';

// Parent-friendly evaluation ratings (1-5 stars)
export type HomeworkEvaluation = 1 | 2 | 3 | 4 | 5;

// Friendly labels for each rating
export const EVALUATION_LABELS: Record<HomeworkEvaluation, string> = {
  1: 'Needs More Practice',
  2: 'Making Progress',
  3: 'Good Effort',
  4: 'Great Work',
  5: 'Excellent',
};

export interface Homework {
  id: string;
  studentId: string;
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  dueDate?: Timestamp;
  status: HomeworkStatus;
  evaluation?: HomeworkEvaluation;
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
  evaluation?: HomeworkEvaluation;
  notes?: string;
}
