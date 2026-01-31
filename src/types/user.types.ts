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
  // Push notifications
  expoPushToken?: string;
  notificationsEnabled?: boolean;
  // Teacher-specific fields
  classIds?: string[];
  adminClassIds?: string[]; // Classes where user is an admin (not owner)
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
