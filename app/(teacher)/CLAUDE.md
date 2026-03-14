# app/(teacher)/

Teacher screens. Bottom tab layout: Home, Classes, Settings.

## Top-level screens
- **index.tsx** — Home dashboard. Shows class dropdown, today's attendance list (mark present/absent inline), recent homework, quick-assign homework. Uses `subscribeToStudents`, `getStudentAttendanceForDate`, `toggleAttendance`, `createHomework`.
- **settings.tsx** — Account info, push notification toggle, sign out.
- **help.tsx** — Help/FAQ.

## classes/
- **index.tsx** — Class list. Uses `subscribeToClasses(teacherId, ...)`.
- **create.tsx** — Create new class form.

## classes/[classId]/
- **index.tsx** — Class detail: student list + FAB to add student. Uses `subscribeToStudents(classId, teacherId, ...)`.
- **edit.tsx** — Edit class name, manage invited teachers (add/remove admin emails), delete class. Uses `addAdmin`, `removeAdmin`, `deleteClass`.
- **reports.tsx** — Monthly attendance calendar + homework stats per student. Queries homework and attendance by `classId` and `teacherId`.

## classes/[classId]/students/
- **add.tsx** — 3-step flow: (1) enter parent email, (2) select existing child or add new, (3) student + parent info form. Calls `createStudent(classId, teacherId, data)` or `linkExistingStudentToClass`. Queries students with `where('teacherId', '==', uid)` to find existing children for that parent.

## classes/[classId]/students/[studentId]/
- **index.tsx** — Student detail: recent homework + attendance. Uses `subscribeToHomework(studentId, teacherId)`, `subscribeToAttendance(studentId, teacherId)`.
- **edit.tsx** — Edit student name, delete student. `deleteStudent(studentId, classId, teacherId)`.
- **parents.tsx** — Edit parent list. Add/remove parents, create invite docs. Uses `updateStudent`, `unlinkParentsFromStudent`.

## classes/[classId]/students/[studentId]/homework/
- **index.tsx** — Full homework list with pagination. `getHomeworkPaginated(studentId, teacherId, ...)`.
- **add.tsx** — Assign homework form. Fetches student to get `parentUserIds` and `invitedTeacherIds`, passes them to `createHomework`.

## classes/[classId]/students/[studentId]/attendance/
- **index.tsx** — Full attendance list with pagination. `getAttendancePaginated(studentId, teacherId, ...)`.
- **add.tsx** — Mark attendance with date picker + status. Fetches student for access arrays, passes to `createAttendance`.
