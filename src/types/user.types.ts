import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type UserRole = 'teacher' | 'parent';

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  // Teacher-specific fields
  classIds?: string[];
  // Parent-specific fields
  studentIds?: string[];
  invitedBy?: string;
  inviteAcceptedAt?: FirebaseFirestoreTypes.Timestamp;
}

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}
