import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface Class {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  studentCount: number;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface CreateClassData {
  name: string;
  description?: string;
}

export interface UpdateClassData {
  name?: string;
  description?: string;
}
