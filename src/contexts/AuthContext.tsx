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
  sendEmailVerification,
  deleteUser as firebaseDeleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, firestore, functions } from '../config/firebase';
import { User, UserRole } from '../types';
import {
  registerForPushNotifications,
  savePushToken,
  removePushToken,
} from '../services/notification.service';
import { clearSelectedClassId } from '../utils/storage';
import { deleteClass, removeAdmin, getClassesByIds } from '../services/class.service';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  emailVerified: boolean;
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
  refreshUser: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadFirebaseUser: () => Promise<void>;
  registerPushNotifications: () => Promise<void>;
  checkForNewInvites: () => Promise<boolean>;
  checkForNewAdminInvites: () => Promise<boolean>;
  deleteAccount: (password: string) => Promise<void>;
  deleteTeacherAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check for invites and link parent to students via HTTPS callable (uses Admin SDK,
// so it can update student/homework/attendance docs regardless of security rules).
async function acceptPendingInvites(
  userId: string,
  email: string,
  existingStudentIds: string[] = []
): Promise<string[]> {
  const acceptInvites = httpsCallable<{ email: string }, { studentIds: string[] }>(
    functions,
    'acceptParentInvites'
  );

  const result = await acceptInvites({ email: email.toLowerCase() });
  const newStudentIds = result.data.studentIds.filter(
    (id) => !existingStudentIds.includes(id)
  );

  // Add studentIds to user profile
  if (newStudentIds.length > 0) {
    const userRef = doc(firestore, 'users', userId);
    await updateDoc(userRef, {
      studentIds: arrayUnion(...newStudentIds),
    });
  }

  return newStudentIds;
}

// Check for admin invites and link teacher to classes they administer
async function acceptPendingAdminInvites(
  userId: string,
  email: string,
  existingAdminClassIds: string[] = []
): Promise<string[]> {
  const adminInvitesRef = collection(firestore, 'adminInvites');

  // Query ALL admin invites for this email
  const q = query(
    adminInvitesRef,
    where('email', '==', email.toLowerCase())
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return [];
  }

  const classIds: string[] = [];

  // Process each admin invite
  for (const inviteDoc of snapshot.docs) {
    const invite = inviteDoc.data();
    const classId = invite.classId;

    // Skip if user already has this class in adminClassIds
    if (existingAdminClassIds.includes(classId)) {
      continue;
    }

    classIds.push(classId);

    // Update invite status to accepted (if not already)
    // The Cloud Function (onTeacherInviteAccepted) will handle updating the class doc
    // (admin inviteStatus, userId) and backfilling invitedTeacherIds on student/homework/attendance docs
    if (invite.status === 'pending') {
      await updateDoc(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        userId,
      });
    }
  }

  // Add classIds to user's adminClassIds
  if (classIds.length > 0) {
    const userRef = doc(firestore, 'users', userId);
    await updateDoc(userRef, {
      adminClassIds: arrayUnion(...classIds),
    });
  }

  return classIds;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const signingUp = React.useRef(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Skip Firestore operations during signup — signUp handles everything
        if (signingUp.current) {
          return;
        }

        // Fetch user profile from Firestore
        try {
          const userDoc = await getDoc(doc(firestore, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const userData = { uid: fbUser.uid, ...userDoc.data() } as User;

            // Stamp emailVerified on the Firestore doc the first time the user
            // logs in with a verified email. The Cloud Function watches for this
            // field transition to send the admin notification.
            if (fbUser.emailVerified && !userDoc.data().emailVerified) {
              await updateDoc(doc(firestore, 'users', fbUser.uid), {
                emailVerified: true,
              });
              userData.emailVerified = true;
            }

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

            // If teacher, check for admin invites and accept them
            if (userData.role === 'teacher' && fbUser.email) {
              const existingAdminClassIds = userData.adminClassIds || [];
              const newAdminClassIds = await acceptPendingAdminInvites(
                fbUser.uid,
                fbUser.email,
                existingAdminClassIds
              );
              if (newAdminClassIds.length > 0) {
                // Refresh user data to include new adminClassIds
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
      // Prevent onAuthStateChanged from racing with signup Firestore operations
      signingUp.current = true;

      try {
        const { user: fbUser } = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        // Ensure the auth token is available for Firestore before proceeding
        await fbUser.getIdToken();

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

        // Send email verification
        await sendEmailVerification(fbUser);

        // If parent, immediately check and accept any pending invites
        if (role === 'parent') {
          await acceptPendingInvites(fbUser.uid, email);
        }

        // If teacher, immediately check and accept any pending admin invites
        if (role === 'teacher') {
          await acceptPendingAdminInvites(fbUser.uid, email);
        }

        // Set user state directly since we skipped onAuthStateChanged
        const createdDoc = await getDoc(doc(firestore, 'users', fbUser.uid));
        if (createdDoc.exists()) {
          setUser({ uid: fbUser.uid, ...createdDoc.data() } as User);
        }
      } finally {
        signingUp.current = false;
        setLoading(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    // Remove push token before signing out (don't block signout if this fails)
    if (firebaseUser) {
      try {
        await removePushToken(firebaseUser.uid);
      } catch {
        // Ignore - signout should proceed even if token removal fails
      }
    }
    // Clear persisted class selection so it doesn't leak to the next account
    try {
      await clearSelectedClassId();
    } catch {
      // Ignore
    }
    await firebaseSignOut(auth);
  }, [firebaseUser]);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        setUser({ uid: firebaseUser.uid, ...userDoc.data() } as User);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  }, [firebaseUser]);

  const resendVerificationEmail = useCallback(async () => {
    if (!firebaseUser) throw new Error('No user logged in');
    await sendEmailVerification(firebaseUser);
  }, [firebaseUser]);

  const reloadFirebaseUser = useCallback(async () => {
    if (!firebaseUser) return;
    await firebaseUser.reload();
    // Get fresh reference from auth.currentUser to preserve methods
    const freshUser = auth.currentUser;
    if (freshUser) {
      setFirebaseUser(freshUser);

      // onAuthStateChanged doesn't reliably re-fire after reload(), so stamp
      // emailVerified here if it just became true, then notify admin via callable.
      if (freshUser.emailVerified && user && !user.emailVerified) {
        try {
          await updateDoc(doc(firestore, 'users', freshUser.uid), {
            emailVerified: true,
          });
          setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev));

        } catch (error) {
          console.error('Error stamping emailVerified:', error);
        }
      }
    }
  }, [firebaseUser, user]);

  const registerPushNotifications = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(firebaseUser.uid, token);
        await updateDoc(doc(firestore, 'users', firebaseUser.uid), {
          notificationsEnabled: true,
        });
        const userDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDoc.data() } as User);
        }
      }
    } catch (error) {
      console.error('Error registering push notifications:', error);
    }
  }, [firebaseUser]);

  const deleteAccount = useCallback(async (password: string) => {
    if (!firebaseUser || !user) throw new Error('No user logged in');
    if (user.role !== 'parent') throw new Error('Only parent accounts can be deleted');
    if (!firebaseUser.email) throw new Error('No email on account');

    // Re-authenticate before destructive operation
    const credential = EmailAuthProvider.credential(firebaseUser.email, password);
    await reauthenticateWithCredential(firebaseUser, credential);

    // Remove push token
    try {
      await removePushToken(firebaseUser.uid);
    } catch {
      // Ignore - deletion should proceed
    }

    // Delete Firestore user document
    await deleteDoc(doc(firestore, 'users', firebaseUser.uid));

    // Clear persisted class selection
    try {
      await clearSelectedClassId();
    } catch {
      // Ignore
    }

    // Delete Firebase Auth account (must be last - loses auth)
    await firebaseDeleteUser(firebaseUser);
  }, [firebaseUser, user]);

  const deleteTeacherAccount = useCallback(async (password: string) => {
    if (!firebaseUser || !user) throw new Error('No user logged in');
    if (user.role !== 'teacher') throw new Error('Only teacher accounts use this method');
    if (!firebaseUser.email) throw new Error('No email on account');

    // Re-authenticate before destructive operation
    const credential = EmailAuthProvider.credential(firebaseUser.email, password);
    await reauthenticateWithCredential(firebaseUser, credential);

    // Remove push token
    try {
      await removePushToken(firebaseUser.uid);
    } catch {
      // Ignore - deletion should proceed
    }

    // Delete all owned classes (includes full cleanup of students, homework, attendance, parent links)
    const ownedClassIds = user.classIds || [];
    for (const classId of ownedClassIds) {
      try {
        await deleteClass(classId);
      } catch (err) {
        console.error(`Failed to delete owned class ${classId}:`, err);
      }
    }

    // Remove self as co-teacher from all admin classes
    const adminClassIds = user.adminClassIds || [];
    if (adminClassIds.length > 0) {
      const adminClasses = await getClassesByIds(adminClassIds);
      for (const cls of adminClasses) {
        try {
          // Find our admin entry by userId to get the email used
          const adminEntry = cls.admins?.find((a) => a.userId === firebaseUser.uid);
          if (adminEntry) {
            await removeAdmin(cls.id, adminEntry.email);
          }
        } catch (err) {
          console.error(`Failed to remove self from admin class ${cls.id}:`, err);
        }
      }
    }

    // Delete Firestore user document
    await deleteDoc(doc(firestore, 'users', firebaseUser.uid));

    // Clear persisted class selection
    try {
      await clearSelectedClassId();
    } catch {
      // Ignore
    }

    // Delete Firebase Auth account (must be last - loses auth)
    await firebaseDeleteUser(firebaseUser);
  }, [firebaseUser, user]);

  // Check for new admin invites (for teachers who are already signed in)
  const checkForNewAdminInvites = useCallback(async (): Promise<boolean> => {
    if (!firebaseUser?.email || !user || user.role !== 'teacher') {
      return false;
    }

    try {
      const existingAdminClassIds = user.adminClassIds || [];
      const newAdminClassIds = await acceptPendingAdminInvites(
        firebaseUser.uid,
        firebaseUser.email,
        existingAdminClassIds
      );

      // Always refresh user data so useClasses picks up any changes
      const refreshedDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      if (refreshedDoc.exists()) {
        setUser({ uid: firebaseUser.uid, ...refreshedDoc.data() } as User);
      }

      return newAdminClassIds.length > 0;
    } catch (error) {
      console.error('Error checking for new admin invites:', error);
      return false;
    }
  }, [firebaseUser, user]);

  // Check for new invites (for parents who are already signed in)
  const checkForNewInvites = useCallback(async (): Promise<boolean> => {
    if (!firebaseUser?.email || !user || user.role !== 'parent') {
      return false;
    }

    try {
      const existingStudentIds = user.studentIds || [];
      const newStudentIds = await acceptPendingInvites(
        firebaseUser.uid,
        firebaseUser.email,
        existingStudentIds
      );

      // Always refresh user data — studentIds may have changed
      // (e.g., a teacher deleted a student, removing the parent's link)
      const refreshedDoc = await getDoc(doc(firestore, 'users', firebaseUser.uid));
      if (refreshedDoc.exists()) {
        setUser({ uid: firebaseUser.uid, ...refreshedDoc.data() } as User);
      }

      return newStudentIds.length > 0;
    } catch (error) {
      console.error('Error checking for new invites:', error);
      return false;
    }
  }, [firebaseUser, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        emailVerified: firebaseUser?.emailVerified ?? false,
        signIn,
        signUp,
        signOut,
        resetPassword,
        refreshUser,
        resendVerificationEmail,
        reloadFirebaseUser,
        registerPushNotifications,
        checkForNewInvites,
        checkForNewAdminInvites,
        deleteAccount,
        deleteTeacherAccount,
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
