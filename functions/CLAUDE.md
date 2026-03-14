# functions/

Firebase Cloud Functions v2. All use Admin SDK (bypasses security rules).

## Cloud Functions (functions/src/index.ts)

### notifyParentsOnHomework
- Trigger: `onDocumentCreated('homework/{homeworkId}')`
- Sends Expo push notifications to all accepted parents of the student

### sendParentInviteEmail
- Trigger: `onDocumentCreated('invites/{inviteId}')`
- Sends invite email via Resend to the parent's email address

### notifyAdminOnTeacherSignup
- Trigger: `onDocumentUpdated('users/{userId}')`
- Fires when `emailVerified` flips from falsy to `true` AND role is `teacher`
- Sends email to `ADMIN_EMAIL` env var

### onInviteAccepted
- Trigger: `onDocumentUpdated('invites/{inviteId}')`
- Fires when `status` changes to `'accepted'`
- Updates student doc: sets parent's `inviteStatus` + `userId`, adds to `parentUserIds`
- Backfills `parentUserIds` on all homework + attendance docs for that student

### onTeacherInviteAccepted
- Trigger: `onDocumentUpdated('adminInvites/{inviteId}')`
- Fires when `status` changes to `'accepted'`
- Updates class doc: sets admin's `inviteStatus` + `userId`
- Backfills `invitedTeacherIds` on all student + homework + attendance docs in that class

### onTeacherRemoved
- Trigger: `onDocumentUpdated('classes/{classId}')`
- Detects removed admin userIds by comparing before/after `admins[]`
- Removes their userId from `invitedTeacherIds` on all student + homework + attendance docs

## Environment Variables
- `RESEND_API_KEY` — Resend API key for emails
- `RESEND_FROM_EMAIL` — From address (default: `noreply@ilmtrack.app`)
- `ADMIN_EMAIL` — Admin notification recipient
