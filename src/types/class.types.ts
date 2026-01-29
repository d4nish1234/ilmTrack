import { Timestamp } from 'firebase/firestore';

export interface Class {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  studentCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateClassData {
  name: string;
  description?: string;
}

export interface UpdateClassData {
  name?: string;
  description?: string;
}
