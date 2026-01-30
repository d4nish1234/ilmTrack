import { Timestamp } from 'firebase/firestore';

export type AdminInviteStatus = 'pending' | 'accepted';

export interface Admin {
  email: string;
  userId?: string;
  inviteStatus: AdminInviteStatus;
  inviteSentAt: Timestamp;
  acceptedAt?: Timestamp;
}

export interface Class {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  admins: Admin[];
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
  admins?: Admin[];
}
