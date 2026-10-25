# app/(teacher)/

Teacher screens. Bottom tab layout: Classes, Organization (only for org admins), Settings.

## organization/
- **index.tsx** — Selected org (switcher when there are several) and its tools list.
- **timekeeping.tsx** — On/off switch, locations (`LocationEditor`), teachers with this week's summary.
- **teacher/[teacherId].tsx** — One teacher's week: + per day, tap a shift to edit (`ShiftEditor`), "Copy to next week" (asks before replacing, then moves to the copied week).

## Top-level screens
- **index.tsx** — Home dashboard. Shows class dropdown, today's attendance list (mark present/absent inline), recent homework, quick-assign homework. Uses `subscribeToStudents`, `getStudentAttendanceForDate`, `toggleAttendance`, `createHomework`.
- **settings.tsx** — Account info, push notification toggle, sign out.
- **help.tsx** — Help/FAQ.

## classes/
- **index.tsx** — Class list. Uses `subscribeToClasses(teacherId, ...)`.
- **create.tsx** — Create new class form.
- **add-attendance.tsx** — The one Add Attendance sheet (`AddAttendanceForm`, params `classId`, `studentId`). Opened by the student screen's Add Attendance button and Attendance History's +. Same reason as add-homework for living here.
- **evaluate-homework.tsx** — Evaluate Homework sheet (`EvaluateHomeworkForm`, param `studentId`), opened by the Classes swipe "Evaluate": rate up to 3 pending items and mark each Complete / Late / Incomplete.
- **add-homework.tsx** — The one Add Homework sheet (`AddHomeworkForm`, params `classId`, `studentId`). Opened by the Classes swipe "New", the student screen's Add Homework button and Homework History's +. Kept in the classes stack so it is always presented as a modal sheet; asks before a second assignment on the same day.

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

## classes/[classId]/students/[studentId]/attendance/
- **index.tsx** — Full attendance list with pagination. `getAttendancePaginated(studentId, teacherId, ...)`.
