import firestore from '@react-native-firebase/firestore';
import { Homework, CreateHomeworkData, UpdateHomeworkData } from '../types';

const homeworkCollection = firestore().collection('homework');

export async function createHomework(
  studentId: string,
  classId: string,
  teacherId: string,
  data: CreateHomeworkData
): Promise<string> {
  const docRef = await homeworkCollection.add({
    studentId,
    classId,
    teacherId,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate
      ? firestore.Timestamp.fromDate(data.dueDate)
      : null,
    notes: data.notes || null,
    status: 'assigned',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

export async function getHomework(studentId: string): Promise<Homework[]> {
  const snapshot = await homeworkCollection
    .where('studentId', '==', studentId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Homework[];
}

export function subscribeToHomework(
  studentId: string,
  onUpdate: (homework: Homework[]) => void,
  onError: (error: Error) => void
): () => void {
  return homeworkCollection
    .where('studentId', '==', studentId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snapshot) => {
        const homework = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Homework[];
        onUpdate(homework);
      },
      (error) => {
        onError(error);
      }
    );
}

export async function updateHomework(
  homeworkId: string,
  data: UpdateHomeworkData
): Promise<void> {
  const updateData: any = {
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (data.dueDate) {
    updateData.dueDate = firestore.Timestamp.fromDate(data.dueDate);
  }

  if (data.status === 'completed') {
    updateData.completedAt = firestore.FieldValue.serverTimestamp();
  }

  await homeworkCollection.doc(homeworkId).update(updateData);
}

export async function deleteHomework(homeworkId: string): Promise<void> {
  await homeworkCollection.doc(homeworkId).delete();
}
