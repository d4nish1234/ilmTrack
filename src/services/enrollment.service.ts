import { firestore } from '../config/firebase';
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import { Student } from '../types';

/**
 * Class membership, read from `enrollments` rather than `students.classId`.
 *
 * A student has one document; an enrolment says which class they are in, so a
 * student in two classes is one person rather than two records with separate
 * histories. See ../../todo.md step 4.
 *
 * Reads only. Enrolments are written by the Admin SDK — the migration script,
 * the backfill trigger, and the delete/transfer Cloud Functions — and
 * firestore.rules refuses client writes outright, so the collection that
 * decides who is in a class is out of reach of the people it governs.
 */

const enrollmentsRef = collection(firestore, 'enrollments');
const studentsRef = collection(firestore, 'students');

/** Firestore caps an `in` filter at 30 values. */
const IN_LIMIT = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const byLastName = (a: Student, b: Student) =>
  (a.lastName || '').localeCompare(b.lastName || '');

/** The student ids enrolled in a class. */
export async function getEnrolledStudentIds(classId: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(enrollmentsRef, where('classId', '==', classId), where('active', '==', true))
  );
  return [...new Set(snapshot.docs.map((d) => d.data().studentId as string).filter(Boolean))];
}

/**
 * Fetch students by id, in chunks.
 *
 * These are document lookups rather than a list query, so each is authorized
 * on its own — which is what keeps the security rules' document-read budget
 * irrelevant here however many classes are involved.
 */
export async function getStudentsByIds(ids: string[]): Promise<Student[]> {
  if (ids.length === 0) return [];

  const results = await Promise.all(
    chunk(ids, IN_LIMIT).map((batch) =>
      getDocs(query(studentsRef, where(documentId(), 'in', batch)))
    )
  );

  return results
    .flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)))
    .sort(byLastName);
}

/** Everyone currently enrolled in a class. */
export async function getStudentsInClass(classId: string): Promise<Student[]> {
  return getStudentsByIds(await getEnrolledStudentIds(classId));
}

/**
 * Live roster for a class.
 *
 * Two hops — enrolments, then the students they name — so a change to either
 * has to re-read the other. The enrolment list is what is watched, because
 * that is what changes when someone joins or leaves; edits to a student's own
 * fields are picked up on the next roster change or screen load, which is the
 * same freshness the previous single-query version gave.
 */
export function subscribeToEnrolledStudents(
  classId: string,
  onUpdate: (students: Student[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    query(enrollmentsRef, where('classId', '==', classId), where('active', '==', true)),
    async (snapshot: QuerySnapshot) => {
      try {
        const ids = [...new Set(snapshot.docs.map((d) => d.data().studentId as string).filter(Boolean))];
        onUpdate(await getStudentsByIds(ids));
      } catch (error) {
        onError(error as Error);
      }
    },
    (error) => onError(error)
  );
}
