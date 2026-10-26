# app/(teacher)/

Teacher screens. Bottom tab layout: Classes, Organization (only for org admins), Settings.

## organization/
- **index.tsx** — Selected org (switcher when there are several) and its tools list.
- **timekeeping.tsx** — On/off switch, locations, teachers with this week's summary. Tapping a location opens the **location.tsx** sheet.
- **shift.tsx** / **location.tsx** — Modal sheets wrapping `ShiftForm` / `LocationForm`. An existing shift's sheet also has `TimeWorkedPanel` (what was worked, Correct time / Add time); a shift removed after it was worked opens with only that panel. Each loads its own data from params (`teacherId`, `weekStart`, `shiftId` or `date`; `locationId`), so the screens that open them just push a route.
- **teacher/[teacherId].tsx** — One teacher's week: + per day, tap a shift to edit (both open the **shift.tsx** sheet), "Copy to next week" (asks before replacing, then moves to the copied week).

## Top-level screens
- **index.tsx** — Home dashboard. Shows class dropdown, today's attendance list (mark present/absent inline), recent homework, quick-assign homework. Uses `subscribeToStudents`, `getStudentAttendanceForDate`, `toggleAttendance`, `createHomework`.
- **settings/index.tsx** — Account info, push notification toggle, sign out.
- **settings/help.tsx** — Help/FAQ, pushed from Settings. Not a hidden tab: since expo-router 58, focusing a tab hidden with `href: null` redirects to the first tab.

## classes/
- **index.tsx** — Class list. Uses `subscribeToClasses(teacherId, ...)`.
- **create.tsx** — Create new class form.
- **time.tsx** — The Time sheet (`TimeClockSheet`): start / break / resume / end, the end summary with a note, and this week's shifts. Opened from `TimeClockBar`, a slim colour-coded row under the class picker on the Classes screen (green on shift, amber on break, blue ready, grey otherwise; colours in `src/constants/theme.ts`). Follows the selected class: shown when its org has timekeeping on (even with no shifts yet, so teachers know it exists), hidden for classes outside one. An open shift always shows, whatever class is selected; org admins with no classes see their org. The sheet's **Past weeks** (`TimeHistory`) pages back a week at a time, for the same org.
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
