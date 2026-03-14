# app/(parent)/

Parent screens. Bottom tab layout: Home, Homework, Attendance, Settings.

All data queries use `where('parentUserIds', 'array-contains', user.uid)` — NOT `where('studentId', 'in', ...)`.

## Screens
- **index.tsx** — Dashboard. Fetches students by individual `getDoc` calls using `user.studentIds[]`. Shows recent homework and attendance summaries. Queries `homework` and `attendance` collections with `array-contains` on `parentUserIds`. Client-side sort by `createdAt` desc.
- **homework.tsx** — Full homework list with pagination. Uses `getHomeworkPaginatedForParent(user.uid, pageSize, lastDoc)`. Supports child filter. Pull-to-refresh calls `checkForNewInvites()`.
- **attendance.tsx** — Full attendance list with pagination. Uses `getAttendancePaginatedForParent(user.uid, pageSize, lastDoc)`. Same child filter and refresh pattern.
- **settings.tsx** — Account info, push notification toggle, sign out.
- **help.tsx** — Help/FAQ.

## Data flow
1. Parent signs up/logs in → `acceptPendingInvites` runs in AuthContext
2. Invite doc gets `status: 'accepted'` + `parentId` → Cloud Function (`onInviteAccepted`) updates student doc's `parentUserIds` and backfills homework/attendance docs
3. Parent's `studentIds` on user profile lets them fetch student docs by ID
4. `parentUserIds` on homework/attendance docs lets them query via `array-contains`
