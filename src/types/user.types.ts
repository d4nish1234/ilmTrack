import { Timestamp } from 'firebase/firestore';

export type UserRole = 'teacher' | 'parent';

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Teacher-specific fields
  classIds?: string[];
  // Parent-specific fields
  studentIds?: string[];
  invitedBy?: string;
  inviteAcceptedAt?: Timestamp;
}

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}
