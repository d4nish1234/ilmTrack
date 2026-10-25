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

## Time clock (functions/src/timeclock.ts)
Pure logic (timezones, distance, location verdict, worked minutes, shift validation) is in `timeclockCore.ts`, tested without the emulator.
- `getMyTimekeeping({orgIds})` — every org where timekeeping is on and the caller belongs (teaches a class in it or administers it), with their shifts this week — possibly none — and exact `startAt`/`endAt` ms. Orgs come from their schedules, the orgs they administer, and `orgIds` hints sent by the app from its classes (capped at 20, each verified) — so the server never reads every class a teacher owns
- `startShift({orgId, weekStart, shiftId, position})` — window (15 min early → end), membership, location; creates `timeEntries/{orgId}_{uid}_{date}_{shiftId}` and the `activeShifts/{uid}` lock
- `pauseShift` / `resumeShift` (re-checks location) / `endShift` (no position; optional `endedAt` from an offline tap, only ever shortens). Positions are checked and discarded, never stored / `setShiftNote`
- `correctTimeEntry` — org admins only, reason required: sets worked from/to on a shift (or adds time for one never started), within the shift as scheduled now; keeps the teacher's record in `original` the first time; refuses a shift still running
- `closeFinishedShiftsJob` — every 5 minutes, closes entries whose `openUntil` has passed (`endedBy: 'schedule'`)
- Tests: `tests/timeclockCore.test.ts` (pure) and `tests/timeclock.test.ts` (callables against the emulator, `Date` faked)

## Environment Variables
- `RESEND_API_KEY` — Resend API key for emails
- `RESEND_FROM_EMAIL` — From address (default: `noreply@ilmtrack.app`)
- `ADMIN_EMAIL` — Admin notification recipient
