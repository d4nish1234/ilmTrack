/**
 * Utility to clean up parent-student links when a student is deleted
 * or a parent is removed from a student.
 *
 * This is a temporary guard until a robust family invite system is built.
 * Safe to remove/replace in the future.
 */
import { firestore } from '../config/firebase';
import { doc, updateDoc, arrayRemove, getDoc } from 'firebase/firestore';
import { Parent } from '../types';

/**
 * Removes a studentId from the given parents' user documents.
 * Only affects parents who have a userId (i.e., they have signed up).
 */
export async function unlinkParentsFromStudent(
  studentId: string,
  parents: Parent[]
): Promise<void> {
  for (const parent of parents) {
    if (parent.userId) {
      try {
        const userRef = doc(firestore, 'users', parent.userId);
        await updateDoc(userRef, {
          studentIds: arrayRemove(studentId),
        });
      } catch (error) {
        // Log but don't throw - cleanup is best-effort
        console.error(`Failed to unlink parent ${parent.userId} from student ${studentId}:`, error);
      }
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
