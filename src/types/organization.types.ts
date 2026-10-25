import { Timestamp } from 'firebase/firestore';

/**
 * A school or group that owns classes. Created and staffed from ilmtrack-admin
 * (Admin SDK) only — the app reads organizations, it never writes them.
 *
 * `members` are the people who *administer* the organization. Its teachers are
 * not listed here: a teacher belongs to an organization by teaching one of its
 * classes (see orgTeacherIds in organization.service.ts).
 */
export type OrgRole = 'owner' | 'admin';

export interface OrgMember {
  userId: string;
  email: string;
  role: OrgRole;
}

export interface Organization {
  id: string;
  name: string;
  members: OrgMember[];
  /** Derived from members by the console; what the security rules read. */
  memberUserIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A teacher of at least one of the organization's classes. */
export interface OrgTeacher {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Names of the organization's classes this person teaches or co-teaches. */
  classNames: string[];
}
