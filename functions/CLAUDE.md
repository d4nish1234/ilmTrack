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
- `getMyWeek({weekStart})` — the caller's own shifts for any week up to next, same shape as `getMyTimekeeping`, for their history. Orgs come from their schedules and entries that week, not current membership, so their hours stay visible after timekeeping is turned off or they leave
- `saveScheduleTemplate({orgId, template, dryRun, create?, expectedUpdatedAt?})` / `deleteScheduleTemplate({orgId, templateId, dryRun})` (`scheduleTemplates.ts`, pure logic in `scheduleTemplatesCore.ts`) — org admins only. Save validates the template (`parseTemplate`; the app's `templateProblem` mirrors its messages), checks anyone newly added is in the org (an admin, or a class owner or accepted co-teacher of one of its classes), stores it, then rewrites every affected teacher's weeks from today to the template's end (`reconcileWeek`, one transaction per teacher, 10 teachers at a time). The app sends the id even for a new template (`create: true`) so a retry doesn't make a second, and for an edit the `updatedAt` it opened: a save over someone else's newer change is refused (`failed-precondition`) unless the content is identical (a retry). While applying, the template holds `pending` (people and dates an earlier version covered that this one doesn't), removed when done, so an interrupted save is finished by saving again; at rest nothing extra is stored. Re-runnable; `dryRun` returns the same counts without writing, for the app's preview. Delete removes the template's future shifts, then the template
- `correctTimeEntry` — org admins only, reason required: sets worked from/to on a shift (or adds time for one never started), within the shift as scheduled now; keeps the teacher's record in `original` the first time; refuses a shift still running
- `closeFinishedShiftsJob` — every 5 minutes, closes entries whose `openUntil` has passed (`endedBy: 'schedule'`)
- Tests: `tests/timeclockCore.test.ts` (pure) and `tests/timeclock.test.ts` (callables against the emulator, `Date` faked)

## Environment Variables
- `RESEND_API_KEY` — Resend API key for emails
- `RESEND_FROM_EMAIL` — From address (default: `noreply@ilmtrack.app`)
- `ADMIN_EMAIL` — Admin notification recipient
