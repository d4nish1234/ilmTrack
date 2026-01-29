import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { User, UserRole } from '../types';

export async function signIn(
  email: string,
  password: string
): Promise<void> {
  await auth().signInWithEmailAndPassword(email, password);
}

export async function signUp(
  email: string,
  password: string,
  role: UserRole,
  firstName: string,
  lastName: string
): Promise<void> {
  const { user: fbUser } = await auth().createUserWithEmailAndPassword(
    email,
    password
  );

  const userData = {
    uid: fbUser.uid,
    email: email.toLowerCase(),
    firstName,
    lastName,
    role,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    ...(role === 'teacher' ? { classIds: [] } : { studentIds: [] }),
  };

  await firestore().collection('users').doc(fbUser.uid).set(userData);
}

export async function signOut(): Promise<void> {
  await auth().signOut();
}

export async function resetPassword(email: string): Promise<void> {
  await auth().sendPasswordResetEmail(email);
}

export async function getCurrentUser(): Promise<User | null> {
  const fbUser = auth().currentUser;
  if (!fbUser) return null;

  const userDoc = await firestore().collection('users').doc(fbUser.uid).get();
  if (!userDoc.exists) return null;

  return { uid: fbUser.uid, ...userDoc.data() } as User;
}

export async function updateUserProfile(
  userId: string,
  data: Partial<Pick<User, 'firstName' | 'lastName'>>
): Promise<void> {
  await firestore()
    .collection('users')
    .doc(userId)
    .update({
      ...data,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}
