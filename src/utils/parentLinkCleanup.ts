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
 * Removes a studentId from the given parents' user documents
 * and deletes the corresponding invite documents to prevent re-linking.
 */
export async function unlinkParentsFromStudent(
  studentId: string,
  parents: Parent[]
): Promise<void> {
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
      // Log but don't throw - cleanup is best-effort
      console.error(`Failed to unlink parent ${parent.email} from student ${studentId}:`, error);
    }
  }
}

/**
 * Given a studentId, fetches the student doc and unlinks all parents.
 * Use this when you need to clean up but don't already have the parent data.
 */
export async function unlinkAllParentsFromStudent(
  studentId: string
): Promise<void> {
  try {
    const studentDoc = await getDoc(doc(firestore, 'students', studentId));
    if (!studentDoc.exists()) return;

    const parents = (studentDoc.data().parents || []) as Parent[];
    await unlinkParentsFromStudent(studentId, parents);
  } catch (error) {
    console.error(`Failed to unlink parents for student ${studentId}:`, error);
  }
}
