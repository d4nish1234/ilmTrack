/**
 * Utility to clean up parent-student links when a student is deleted
 * or a parent is removed from a student.
 *
 * This is a temporary guard until a robust family invite system is built.
 * Safe to remove/replace in the future.
 */
import { firestore } from '../config/firebase';
import { doc, updateDoc, arrayRemove, getDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Parent } from '../types';

/**
 * Did this fail because security rules said no?
 *
 * A permission error means the *caller* was wrong — the cleanup did not happen
 * and will not happen on its own. That has to reach the caller. Anything else
 * (one missing user doc, a flaky write) is genuinely best-effort per parent.
 */
function isPermissionDenied(error: unknown): boolean {
  return (error as { code?: string })?.code === 'permission-denied';
}

/**
 * Removes a studentId from the given parents' user documents
 * and deletes the corresponding invite documents to prevent re-linking.
 */
export async function unlinkParentsFromStudent(
  studentId: string,
  parents: Parent[]
): Promise<void> {
  const denied: string[] = [];

  for (const parent of parents) {
    try {
      let userDocId = parent.userId;

      // If no userId on the parent object, look up by email
      if (!userDocId && parent.email) {
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where('email', '==', parent.email.toLowerCase()));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          userDocId = snapshot.docs[0].id;
        }
      }

      if (userDocId) {
        const userRef = doc(firestore, 'users', userDocId);
        await updateDoc(userRef, {
          studentIds: arrayRemove(studentId),
        });
      }

      // Delete invite documents for this parent+student to prevent
      // acceptPendingInvites from re-linking them on next login
      if (parent.email) {
        const invitesRef = collection(firestore, 'invites');
        const inviteQuery = query(
          invitesRef,
          where('email', '==', parent.email.toLowerCase()),
          where('studentId', '==', studentId)
        );
        const inviteSnapshot = await getDocs(inviteQuery);
        for (const inviteDoc of inviteSnapshot.docs) {
          await deleteDoc(inviteDoc.ref);
        }
      }
    } catch (error) {
      // Log but don't throw - cleanup is best-effort, so the remaining parents
      // are still processed. Permission errors are collected and raised below:
      // they mean nothing was cleaned up and nothing will be.
      console.error(`Failed to unlink parent ${parent.email} from student ${studentId}:`, error);
      if (isPermissionDenied(error)) denied.push(parent.email);
    }
  }

  if (denied.length > 0) {
    throw new Error(
      `Not allowed to unlink ${denied.join(', ')} from student ${studentId}. ` +
        'Their access was left in place.'
    );
  }
}

/**
 * Given a studentId, fetches the student doc and unlinks all parents.
 * Use this when you need to clean up but don't already have the parent data.
 */
export async function unlinkAllParentsFromStudent(
  studentId: string
): Promise<void> {
  let studentDoc;
  try {
    studentDoc = await getDoc(doc(firestore, 'students', studentId));
  } catch (error) {
    // Deliberately logged, not rethrown — "forbidden" and "missing" are the
    // same error here and cannot be told apart.
    //
    // The read rule is `resource.data.teacherId == request.auth.uid || ...`.
    // For a document that does not exist `resource` is null, so evaluating
    // `resource.data` errors and Firestore returns permission-denied rather
    // than an empty snapshot. Rethrowing would therefore break the legitimate
    // case of cleaning up a student that is already gone — a retried or
    // partially-completed delete — which is worse than the silence.
    //
    // The signal that *is* reliable lives in unlinkParentsFromStudent below:
    // there the documents are known to exist, so a permission error really
    // does mean the caller was wrong, and it throws.
    console.error(`Could not read student ${studentId} to unlink parents:`, error);
    return;
  }

  // Already gone — nothing to unlink, and running this twice is fine.
  if (!studentDoc.exists()) return;

  const parents = (studentDoc.data().parents || []) as Parent[];
  await unlinkParentsFromStudent(studentId, parents);
}
