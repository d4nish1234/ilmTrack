# src/contexts/

React contexts providing global state.

## AuthContext.tsx
Primary auth context. Provides: `user`, `firebaseUser`, `loading`, `emailVerified`, `signIn`, `signUp`, `signOut`, `resetPassword`, `refreshUser`, `resendVerificationEmail`, `reloadFirebaseUser`, `registerPushNotifications`, `checkForNewInvites`.

Key behaviors:
- **`onAuthStateChanged`**: Fetches Firestore user profile, stamps `emailVerified: true` on first verified login (triggers Cloud Function for admin notification)
- **`acceptPendingInvites(userId, email)`**: On parent login, queries `invites` collection for matching email, updates invite status to `accepted` (with `parentId`), adds `studentIds` to user profile. Cloud Function handles the rest (student doc + backfill).
- **`acceptPendingAdminInvites(userId, email)`**: On teacher login, queries `adminInvites` for matching email, updates invite status (with `userId`), adds `adminClassIds` to user profile. Cloud Function handles class doc + backfill.
- **`reloadFirebaseUser()`**: Called by the verify-email screen. When the email has just become verified it stamps `emailVerified` *and* links pending invites (parent or co-teacher), because `onAuthStateChanged` doesn't reliably re-fire after `reload()` and signup's own attempt ran unverified. It does all of that *before* publishing the refreshed Firebase user: the root layout navigates home as soon as `emailVerified` flips, so linking must already be done or a parent lands on an empty home screen.
- **Token freshness**: invite acceptance trusts the ID token's `email_verified` claim, which can lag the account by up to an hour. `ensureVerifiedToken()` force-refreshes it before every acceptance when the two disagree.
- **`checkForNewInvites()`**: Called on pull-to-refresh in parent screens — re-runs `acceptPendingInvites` for already-signed-in parents.

## ChildFilterContext.tsx
Provides child filtering for parent screens — lets parents filter homework/attendance by a specific child when they have multiple.

## OrganizationContext.tsx
Orgs the teacher administers (live) and which one the Organization tab shows (persisted in AsyncStorage). Mounted in `app/_layout.tsx` inside `AuthProvider`; subscribes only for teachers. The selection affects that tab only — the Classes tab is unchanged.

## TimeClockContext.tsx
The teacher's time clock, mounted in `app/(teacher)/_layout.tsx` so the Classes bar and the Time sheet share one copy: this week's shifts (refetched on mount, app foreground and after every action), live entries, a server-corrected clock (ticks every second on shift), `focus` (from `utils/timeclock.focusOf`) and the actions. Sends `getMyTimekeeping` the org ids of the teacher's classes and administered orgs as hints, and skips the call entirely when there are none (the time clock can't apply). A class added to an org changes the hints live, which triggers a refetch.

## SelectedClassContext.tsx
Persists the teacher's last-selected class across app restarts (AsyncStorage).
