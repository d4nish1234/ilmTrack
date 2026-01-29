import { auth, firestore } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { User, UserRole } from '../types';

export async function signIn(
  email: string,
  password: string
): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(
  email: string,
  password: string,
  role: UserRole,
  firstName: string,
  lastName: string
): Promise<void> {
  const { user: fbUser } = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const userData = {
    uid: fbUser.uid,
    email: email.toLowerCase(),
    firstName,
    lastName,
    role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(role === 'teacher' ? { classIds: [] } : { studentIds: [] }),
  };

  const userRef = doc(firestore, 'users', fbUser.uid);
  await setDoc(userRef, userData);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function getCurrentUser(): Promise<User | null> {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;

  const userRef = doc(firestore, 'users', fbUser.uid);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) return null;

  return { uid: fbUser.uid, ...userDoc.data() } as User;
}

export async function updateUserProfile(
  userId: string,
  data: Partial<Pick<User, 'firstName' | 'lastName'>>
): Promise<void> {
  const userRef = doc(firestore, 'users', userId);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
