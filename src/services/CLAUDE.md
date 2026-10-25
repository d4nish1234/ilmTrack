# src/services/

Firestore CRUD operations. One file per collection. All list queries include `teacherId` or `parentUserIds`/`invitedTeacherIds` filters to satisfy security rules.

## class.service.ts
- `createClass(teacherId, data)` — creates class doc + adds classId to teacher's `classIds`
- `getClasses(teacherId)` / `subscribeToClasses(teacherId, ...)` — list queries with `where('teacherId', '==', teacherId)`
- `getClass(classId)` — single doc read
- `updateClass(classId, data)` / `deleteClass(classId, teacherId)` — delete also removes students in that class
- `incrementStudentCount(classId)` / `decrementStudentCount(classId)`
- `addAdmin(classId, email)` — adds invited teacher to class `admins[]`, creates `adminInvites` doc
- `removeAdmin(classId, email)` — removes from `admins[]`, removes classId from their `adminClassIds`
- `getClassesByIds(classIds)` / `subscribeToClassesByIds(classIds, ...)` — for invited teachers

## student.service.ts
- `createStudent(classId, teacherId, data)` — creates student + invite docs, includes `parentUserIds: []` and `invitedTeacherIds` (fetched from class admins)
- `getStudents(classId, teacherId)` / `subscribeToStudents(classId, teacherId, ...)` — filtered by both classId AND teacherId
- `getStudent(studentId)` / `subscribeToStudent(studentId, ...)` — single doc reads
- `updateStudent(studentId, data)` — recalculates `parentUserIds` when parents change
- `deleteStudent(studentId, classId, teacherId)` — deletes homework + attendance (filtered by teacherId), unlinks parents
- `linkExistingStudentToClass(studentId, newClassId)` — copies student record to new class
- `getParentUserIds(parents)` — helper: extracts accepted parent userIds
- `getInvitedTeacherIds(classId)` — helper: fetches class doc, extracts accepted admin userIds

## homework.service.ts
- `createHomework(studentId, classId, teacherId, data, parentUserIds, invitedTeacherIds)` — stores access arrays
- `getHomework(studentId, teacherId)` / `subscribeToHomework(studentId, teacherId, ...)` — teacher queries
- `getHomeworkPaginated(studentId, teacherId, pageSize, lastDoc)` — teacher paginated
- `getHomeworkPaginatedForParent(parentUserId, pageSize, lastDoc)` — parent query via `array-contains`
- `getHomeworkAssignedToday(studentId, teacherId, date)` / `getRecentPendingHomework(studentId, teacherId, limit)`
- `updateHomework(homeworkId, data)` / `deleteHomework(homeworkId)`

## attendance.service.ts
Same pattern as homework:
- `createAttendance(studentId, classId, teacherId, data, parentUserIds, invitedTeacherIds)`
- `getAttendance(studentId, teacherId)` / `subscribeToAttendance(studentId, teacherId, ...)`
- `getAttendancePaginated(studentId, teacherId, pageSize, lastDoc)` — teacher paginated
- `getAttendancePaginatedForParent(parentUserId, pageSize, lastDoc)` — parent query
- `getAttendanceByDate(classId, teacherId, date)` / `getStudentAttendanceForDate(studentId, teacherId, date)`
- `toggleAttendance(studentId, classId, teacherId, date, status, parentUserIds, invitedTeacherIds)`

## organization.service.ts
Read-only; organizations are written by ilmtrack-admin.
- `subscribeToMyOrganizations(uid, ...)` — orgs this user administers, `where('memberUserIds', 'array-contains', uid)`
- `orgTeacherIds(classes)` — owners + co-teachers of the given classes (pure helper)
- `getOrgTeachers(orgId)` — classes `where('orgId', '==', orgId)`, then those teachers' user docs

## timekeeping.service.ts
Org admins' writes; each is a transaction setting absolute values.
- `subscribeToTimekeeping(orgId, ...)` / `setTimekeepingEnabled(orgId, enabled, uid)` — first enable creates the doc with the device timezone
- `saveLocation` / `deleteLocation` — replace the `locations[]` array
- `subscribeToOrgWeek(orgId, weekStart, ...)` — every teacher's week, keyed by teacherId
- `subscribeToTeacherWeek(orgId, teacherId, weekStart, ...)`
- `saveShift` / `deleteShift` — re-check overlaps against the stored week
- `inspectWeek` / `copyWeek(orgId, teacherId, from, to, expected, uid)` — replaces the target week only if it is unchanged since `inspectWeek` (compared in a transaction by `updatedAt`); otherwise throws `WeekChangedError` so the UI asks again

## notification.service.ts
- `registerForPushNotifications()` — requests Expo push token
- `savePushToken(userId, token)` / `removePushToken(userId)` — stores on user doc
- `setupNotificationChannel()` — Android notification channel
- `addNotificationListeners(onReceived, onResponse)` — Expo notification handlers

## auth.service.ts
Low-level Firebase Auth wrappers (mostly unused — AuthContext handles auth directly):
- `signIn`, `signUp`, `signOut`, `resetPassword`, `getCurrentUser`, `updateUserProfile`
