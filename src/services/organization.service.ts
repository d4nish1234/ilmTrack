/**
 * Organizations: read-only from the app. Created and staffed in ilmtrack-admin.
 *
 * Two different relationships, kept apart on purpose:
 * - Administering an organization: `members` / `memberUserIds` on the
 *   organization document. Only these people see the Organization tab.
 * - Teaching in one: being the owner or a co-teacher of a class whose `orgId`
 *   points at it. Read from each class's `adminUserIds`, never from
 *   `users/{uid}.adminClassIds` (a UI hint known to drift) and never from
 *   `invitedTeacherIds` on records (being removed in phase 4).
 */
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { firestore } from '../config/firebase';
import type { Class, Organization, OrgTeacher, User } from '../types';

const organizationsRef = collection(firestore, 'organizations');
const classesRef = collection(firestore, 'classes');
const usersRef = collection(firestore, 'users');

/** Firestore caps an `in` filter at 30 values. */
const IN_LIMIT = 30;

/** The organizations this person administers, live. Empty for everyone else. */
export function subscribeToMyOrganizations(
  uid: string,
  onUpdate: (orgs: Organization[]) => void,
  onError: (error: Error) => void
): () => void {
  // The array-contains filter is what lets the rule's memberUserIds check pass
  // for a list query.
  const q = query(organizationsRef, where('memberUserIds', 'array-contains', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const orgs = snapshot.docs
        .map((d) => ({ ...d.data(), id: d.id }) as Organization)
        .sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(orgs);
    },
    onError
  );
}

/**
 * Everyone who teaches one of these classes: each owner plus accepted
 * co-teachers. The owner is added explicitly in case `adminUserIds` has not
 * been written yet by the trigger.
 */
export function orgTeacherIds(
  classes: Pick<Class, 'teacherId' | 'adminUserIds'>[]
): string[] {
  const ids = new Set<string>();
  for (const cls of classes) {
    if (cls.teacherId) ids.add(cls.teacherId);
    for (const uid of cls.adminUserIds ?? []) ids.add(uid);
  }
  return [...ids];
}

/** The organization's teachers with names, sorted by name. */
export async function getOrgTeachers(orgId: string): Promise<OrgTeacher[]> {
  const classSnap = await getDocs(query(classesRef, where('orgId', '==', orgId)));
  const classes = classSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Class);

  const uids = orgTeacherIds(classes);
  const users = new Map<string, User>();
  for (let i = 0; i < uids.length; i += IN_LIMIT) {
    const snap = await getDocs(
      query(usersRef, where(documentId(), 'in', uids.slice(i, i + IN_LIMIT)))
    );
    for (const d of snap.docs) users.set(d.id, d.data() as User);
  }

  return uids
    .filter((uid) => users.has(uid)) // a deleted account leaves nothing to show
    .map((uid) => {
      const user = users.get(uid)!;
      return {
        uid,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        classNames: classes
          .filter((c) => orgTeacherIds([c]).includes(uid))
          .map((c) => c.name)
          .sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
}
