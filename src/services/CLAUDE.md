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

## notification.service.ts
- `registerForPushNotifications()` — requests Expo push token
- `savePushToken(userId, token)` / `removePushToken(userId)` — stores on user doc
- `setupNotificationChannel()` — Android notification channel
- `addNotificationListeners(onReceived, onResponse)` — Expo notification handlers

## auth.service.ts
Low-level Firebase Auth wrappers (mostly unused — AuthContext handles auth directly):
- `signIn`, `signUp`, `signOut`, `resetPassword`, `getCurrentUser`, `updateUserProfile`
