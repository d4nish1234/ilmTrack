import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { auth, firestore } from '../config/firebase';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check for invites and link parent to students
// Handles both pending invites AND already-accepted invites that weren't fully processed
async function acceptPendingInvites(
  userId: string,
  email: string,
  existingStudentIds: string[] = []
): Promise<string[]> {
  const invitesRef = collection(firestore, 'invites');

  // Query ALL invites for this email (not just pending)
  const q = query(
    invitesRef,
    where('email', '==', email.toLowerCase())
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return [];
  }

  const studentIds: string[] = [];

  // Process each invite
  for (const inviteDoc of snapshot.docs) {
    const invite = inviteDoc.data();
    const studentId = invite.studentId;

    // Skip if parent already has this student linked
    if (existingStudentIds.includes(studentId)) {
      continue;
    }

    studentIds.push(studentId);

    // Update invite status to accepted (if not already)
    if (invite.status === 'pending') {
      await updateDoc(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        parentId: userId,
      });
    }

    // Always update the student's parent inviteStatus (handles case where invite was
    // marked accepted but student doc wasn't updated due to previous permission error)
    const studentRef = doc(firestore, 'students', studentId);
    const studentDoc = await getDoc(studentRef);
    if (studentDoc.exists()) {
      const studentData = studentDoc.data();
      const needsUpdate = studentData.parents.some(
        (parent: { email: string; inviteStatus: string }) =>
          parent.email.toLowerCase() === email.toLowerCase() &&
          parent.inviteStatus !== 'accepted'
      );
      if (needsUpdate) {
        const updatedParents = studentData.parents.map((parent: { email: string; inviteStatus: string }) => {
          if (parent.email.toLowerCase() === email.toLowerCase()) {
            return { ...parent, inviteStatus: 'accepted' };
          }
          return parent;
        });
        await updateDoc(studentRef, { parents: updatedParents });
      }
    }
  }

  // Add studentIds to user profile
  if (studentIds.length > 0) {
    const userRef = doc(firestore, 'users', userId);
    await updateDoc(userRef, {
      studentIds: arrayUnion(...studentIds),
    });
  }

  return studentIds;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Fetch user profile from Firestore
        try {
          const userDoc = await getDoc(doc(firestore, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const userData = { uid: fbUser.uid, ...userDoc.data() } as User;

            // If parent, check for invites and accept them
            if (userData.role === 'parent' && fbUser.email) {
              const existingStudentIds = userData.studentIds || [];
              const newStudentIds = await acceptPendingInvites(
                fbUser.uid,
                fbUser.email,
                existingStudentIds
              );
              if (newStudentIds.length > 0) {
                // Refresh user data to include new studentIds
                const refreshedDoc = await getDoc(doc(firestore, 'users', fbUser.uid));
                if (refreshedDoc.exists()) {
                  setUser({ uid: fbUser.uid, ...refreshedDoc.data() } as User);
                  setLoading(false);
                  return;
                }
              }
            }

            setUser(userData);
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return unsubscribeAuth;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      role: UserRole,
      firstName: string,
      lastName: string
    ) => {
      const { user: fbUser } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Create user document in Firestore
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

      await setDoc(doc(firestore, 'users', fbUser.uid), userData);

      // If parent, immediately check and accept any pending invites
      if (role === 'parent') {
        await acceptPendingInvites(fbUser.uid, email);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
