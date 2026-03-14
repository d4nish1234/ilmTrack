# src/contexts/

React contexts providing global state.

## AuthContext.tsx
Primary auth context. Provides: `user`, `firebaseUser`, `loading`, `emailVerified`, `signIn`, `signUp`, `signOut`, `resetPassword`, `refreshUser`, `resendVerificationEmail`, `reloadFirebaseUser`, `registerPushNotifications`, `checkForNewInvites`.

Key behaviors:
- **`onAuthStateChanged`**: Fetches Firestore user profile, stamps `emailVerified: true` on first verified login (triggers Cloud Function for admin notification)
- **`acceptPendingInvites(userId, email)`**: On parent login, queries `invites` collection for matching email, updates invite status to `accepted` (with `parentId`), adds `studentIds` to user profile. Cloud Function handles the rest (student doc + backfill).
- **`acceptPendingAdminInvites(userId, email)`**: On teacher login, queries `adminInvites` for matching email, updates invite status (with `userId`), adds `adminClassIds` to user profile. Cloud Function handles class doc + backfill.
- **`checkForNewInvites()`**: Called on pull-to-refresh in parent screens — re-runs `acceptPendingInvites` for already-signed-in parents.

## ChildFilterContext.tsx
Provides child filtering for parent screens — lets parents filter homework/attendance by a specific child when they have multiple.

## SelectedClassContext.tsx
Persists the teacher's last-selected class across app restarts (AsyncStorage).
