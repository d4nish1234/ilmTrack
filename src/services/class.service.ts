import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { Class, CreateClassData, UpdateClassData, Admin } from '../types';
import { unlinkAllParentsFromStudent } from '../utils/parentLinkCleanup';

const classesRef = collection(firestore, 'classes');

export async function createClass(
  teacherId: string,
  data: CreateClassData
): Promise<string> {
  const docRef = await addDoc(classesRef, {
    ...data,
    teacherId,
    admins: [],
    studentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Add class ID to teacher's classIds array
  const userRef = doc(firestore, 'users', teacherId);
  await updateDoc(userRef, {
    classIds: arrayUnion(docRef.id),
  });

  return docRef.id;
}

export async function getClasses(teacherId: string): Promise<Class[]> {
  const q = query(
    classesRef,
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Class[];
}

export function subscribeToClasses(
  teacherId: string,
  onUpdate: (classes: Class[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    classesRef,
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const classes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Class[];
      onUpdate(classes);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function getClass(classId: string): Promise<Class | null> {
  const docRef = doc(firestore, 'classes', classId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Class;
}

export async function updateClass(
  classId: string,
  data: UpdateClassData
): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClass(
  classId: string,
  teacherId: string
): Promise<void> {
  // Remove class ID from teacher's classIds array
  const userRef = doc(firestore, 'users', teacherId);
  await updateDoc(userRef, {
    classIds: arrayRemove(classId),
  });

  // Unlink all parents from every student in the class (best-effort)
  const studentsRef = collection(firestore, 'students');
  const studentsQuery = query(
    studentsRef,
    where('classId', '==', classId),
    where('teacherId', '==', teacherId)
  );
  const studentsSnapshot = await getDocs(studentsQuery);

  for (const studentDoc of studentsSnapshot.docs) {
    try {
      await unlinkAllParentsFromStudent(studentDoc.id);
    } catch (err) {
      console.error(`Failed to unlink parents for student ${studentDoc.id}:`, err);
    }
  }

  // Collect all docs to delete: homework, attendance, students, and the class
  const docsToDelete: import('firebase/firestore').DocumentReference[] = [];

  const homeworkRef = collection(firestore, 'homework');
  const homeworkQuery = query(
    homeworkRef,
    where('classId', '==', classId),
    where('teacherId', '==', teacherId)
  );
  const homeworkSnapshot = await getDocs(homeworkQuery);
  homeworkSnapshot.docs.forEach((d) => docsToDelete.push(d.ref));

  const attendanceRef = collection(firestore, 'attendance');
  const attendanceQuery = query(
    attendanceRef,
    where('classId', '==', classId),
    where('teacherId', '==', teacherId)
  );
  const attendanceSnapshot = await getDocs(attendanceQuery);
  attendanceSnapshot.docs.forEach((d) => docsToDelete.push(d.ref));

  studentsSnapshot.docs.forEach((d) => docsToDelete.push(d.ref));
  docsToDelete.push(doc(firestore, 'classes', classId));

  // Firestore batches limited to 500 ops — chunk accordingly
  for (let i = 0; i < docsToDelete.length; i += 500) {
    const batch = writeBatch(firestore);
    docsToDelete.slice(i, i + 500).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function incrementStudentCount(classId: string): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    studentCount: increment(1),
  });
}

export async function decrementStudentCount(classId: string): Promise<void> {
  const docRef = doc(firestore, 'classes', classId);
  await updateDoc(docRef, {
    studentCount: increment(-1),
  });
}

export async function addAdmin(
  classId: string,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  // Check if admin already exists for this class
  const classDoc = await getClass(classId);
  if (!classDoc) {
    throw new Error('Class not found');
  }

  const existingAdmin = classDoc.admins?.find(
    (a) => a.email === normalizedEmail
  );
  if (existingAdmin) {
    throw new Error('This email is already an admin for this class');
  }

  const classRef = doc(firestore, 'classes', classId);
  const now = Timestamp.now();

  // Check if user with this email already exists
  const usersRef = collection(firestore, 'users');
  const userQuery = query(usersRef, where('email', '==', normalizedEmail));
  const userSnapshot = await getDocs(userQuery);

  // Build the new admin object
  const currentAdmins = classDoc.admins || [];
  let newAdmin: Admin;

  if (!userSnapshot.empty) {
    // User exists - auto-accept the invite
    const existingUser = userSnapshot.docs[0];
    const teacherUserId = existingUser.id;
    newAdmin = {
      email: normalizedEmail,
      userId: teacherUserId,
      inviteStatus: 'accepted',
      inviteSentAt: now,
      acceptedAt: now,
    };

    // Add classId to their adminClassIds
    await updateDoc(existingUser.ref, {
      adminClassIds: arrayUnion(classId),
    });

    // Backfill invitedTeacherIds on all student/homework/attendance docs in this class
    // (Cloud Function won't fire since adminInvite is created as 'accepted')
    const classOwnerId = classDoc.teacherId;
    const batch = writeBatch(firestore);

    const studentsQuery = query(
      collection(firestore, 'students'),
      where('classId', '==', classId),
      where('teacherId', '==', classOwnerId)
    );
    const studentsSnap = await getDocs(studentsQuery);
    studentsSnap.docs.forEach((d) => {
      batch.update(d.ref, { invitedTeacherIds: arrayUnion(teacherUserId) });
    });

    const homeworkQuery = query(
      collection(firestore, 'homework'),
      where('classId', '==', classId),
      where('teacherId', '==', classOwnerId)
    );
    const homeworkSnap = await getDocs(homeworkQuery);
    homeworkSnap.docs.forEach((d) => {
      batch.update(d.ref, { invitedTeacherIds: arrayUnion(teacherUserId) });
    });

    const attendanceQuery = query(
      collection(firestore, 'attendance'),
      where('classId', '==', classId),
      where('teacherId', '==', classOwnerId)
    );
    const attendanceSnap = await getDocs(attendanceQuery);
    attendanceSnap.docs.forEach((d) => {
      batch.update(d.ref, { invitedTeacherIds: arrayUnion(teacherUserId) });
    });

    await batch.commit();
  } else {
    // User doesn't exist - create pending invite
    newAdmin = {
      email: normalizedEmail,
      inviteStatus: 'pending',
      inviteSentAt: now,
    };
  }

  // Update class with new admin
  await updateDoc(classRef, {
    admins: [...currentAdmins, newAdmin],
    updatedAt: serverTimestamp(),
  });

  // Create admin invite document for tracking
  const adminInvitesRef = collection(firestore, 'adminInvites');
  await addDoc(adminInvitesRef, {
    email: normalizedEmail,
    classId,
    status: userSnapshot.empty ? 'pending' : 'accepted',
    createdAt: serverTimestamp(),
  });
}

export async function removeAdmin(
  classId: string,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  const classDoc = await getClass(classId);
  if (!classDoc) {
    throw new Error('Class not found');
  }

  const adminToRemove = classDoc.admins?.find(
    (a) => a.email === normalizedEmail
  );
  if (!adminToRemove) {
    throw new Error('Admin not found');
  }

  // Remove admin from class
  const updatedAdmins = classDoc.admins?.filter(
    (a) => a.email !== normalizedEmail
  ) || [];

  const classRef = doc(firestore, 'classes', classId);
  await updateDoc(classRef, {
    admins: updatedAdmins,
    updatedAt: serverTimestamp(),
  });

  // If admin had a userId, remove classId from their adminClassIds
  if (adminToRemove.userId) {
    const userRef = doc(firestore, 'users', adminToRemove.userId);
    await updateDoc(userRef, {
      adminClassIds: arrayRemove(classId),
    });
  }
}

export async function getClassesByIds(classIds: string[]): Promise<Class[]> {
  if (classIds.length === 0) {
    return [];
  }

  const classes: Class[] = [];

  // Firestore 'in' queries are limited to 10 items, so we batch
  const batches: string[][] = [];
  for (let i = 0; i < classIds.length; i += 10) {
    batches.push(classIds.slice(i, i + 10));
  }

  for (const batch of batches) {
    const q = query(classesRef, where('__name__', 'in', batch));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((docSnap) => {
      classes.push({ id: docSnap.id, ...docSnap.data() } as Class);
    });
  }

  return classes;
}

export function subscribeToClassesByIds(
  classIds: string[],
  onUpdate: (classes: Class[]) => void,
  onError: (error: Error) => void
): () => void {
  if (classIds.length === 0) {
    onUpdate([]);
    return () => {};
  }

  // For simplicity, we'll just use a single query for up to 10 IDs
  // For more, we'd need multiple subscriptions
  const idsToQuery = classIds.slice(0, 10);
  const q = query(classesRef, where('__name__', 'in', idsToQuery));

  return onSnapshot(
    q,
    (snapshot) => {
      const classes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Class[];
      onUpdate(classes);
    },
    (error) => {
      onError(error);
    }
  );
}
