import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type InviteStatus = 'pending' | 'sent' | 'accepted';

export interface Parent {
  firstName: string;
  lastName: string;
  email: string;
  userId?: string;
  inviteStatus: InviteStatus;
  inviteSentAt?: FirebaseFirestoreTypes.Timestamp;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  teacherId: string;
  parents: Parent[];
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface CreateStudentData {
  firstName: string;
  lastName: string;
  parents: Omit<Parent, 'userId' | 'inviteStatus' | 'inviteSentAt'>[];
}

export interface UpdateStudentData {
  firstName?: string;
  lastName?: string;
}
