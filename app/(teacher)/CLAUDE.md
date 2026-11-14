# app/(teacher)/

Teacher screens. Bottom tab layout: Classes, Organization (only for org admins), Settings.

## organization/
- **index.tsx** — Selected org (switcher when there are several) and its tools list.
- **timekeeping.tsx** — Built around the week: a pager (tap the label for this week), a List | Week toggle, a one-line "N on shift" strip (current week only; tap for a dialog of everyone on shift), then either each person's worked / scheduled hours or the **WeekGrid** (people by day, short times coloured by status; tap an empty day from today on to add a shift (it shows a faint +), a day with one shift to open it, a past empty day, a busier day or a name for that person's week, which opens on the same week). The grid's day header stays in view while scrolling (it's child 2 of the ScrollView, so the children are kept to a fixed five), and List | Week is remembered on the phone (AsyncStorage). Changing weeks fetches only people not loaded yet (`getPeople`); pull-to-refresh reloads everyone. The ⋮ menu holds Settings and Export timesheet (opens **timesheet-export.tsx** on the week being looked at). When timekeeping is off, an explanation and a Turn on button. Every row that opens something has a `›`.
- **timekeeping-settings.tsx** — The on/off switch (turning off asks first), locations (a location opens the **location.tsx** sheet), and a Schedules link (N active) to **schedules.tsx**. Opened from the Timekeeping ⋮ menu. Schedules live here, not on the main screen, so a long people list can't push them out of sight.
- **schedules.tsx** — Schedule templates: current and upcoming, Add schedule, ended ones folded under "Ended". A template opens **schedule.tsx**. Opened from Timekeeping Settings.
- **timesheet-export.tsx** — Export Timesheet: People (Everyone, or chosen on **choose-people.tsx**) and Dates (This week / Last week / This month / Last month chips, or From–To, up to six months), then Export PDF pinned to the bottom (no tab bar). Reads the range's weeks once (`getOrgWeeks`) and shares one PDF: a summary, then each person's shifts with notes and admin edits. Everyone also includes people with shifts who have since left; people chosen by name are listed even with no shifts. Up to 10 people (fewer than everyone) are read person by person (`getTeacherWeeks`), otherwise the whole organization's weeks; Export waits for the timekeeping settings so locations and timezone are right. Opened from one person's week, it starts with them chosen.
- **choose-people.tsx** — The shared Choose People screen, for every list that picks people (the export, schedule templates). Open it with `openPeoplePicker({ people, chosen, everyoneOption, onDone })` (`components/timekeeping/peoplePicker.ts`): routes can't return values, so the request and its callback wait there. Tick boxes, Select all / Clear, search past 8 people, Continue pinned to the bottom (calls `onDone`); back discards. With `everyoneOption`, ticking everyone returns null ("everyone", which the export widens to people who have left). Logic in `utils/peoplePicker.ts`.
- **schedule.tsx** — Create or edit a schedule template: dates, times (weekdays, location), and People (a row opening **choose-people.tsx**). No name on screen: `templateName` makes the one the server requires from the dates and first time, and lists and labels show the dates instead (`templateTitle`). Follows the edit-screen pattern below (leaving with changes asks Discard / Save): Save and apply appears pinned to the bottom once something has changed (`templateChanged`), Delete is at the end of the form. Save previews with a dry run of `saveScheduleTemplate`, then applies on confirm; Delete previews too. The form follows the stored template until the admin changes something, then keeps their edits and the version they started from (sent so the server can refuse a save over someone else's change). A new template's id is made when the screen opens. Moving Starts past Ends moves Ends along.
- **shift.tsx** / **location.tsx** — Modal sheets wrapping `ShiftForm` / `LocationForm`. An existing shift's sheet also has `TimeWorkedPanel` (what was worked, Correct time / Add time); a shift removed after it was worked opens with only that panel. Each loads its own data from params (`teacherId`, `weekStart`, `shiftId` or `date`; `locationId`), so the screens that open them just push a route.
- **teacher/[teacherId].tsx** — One teacher's week: + per day, tap a shift to edit (both open the **shift.tsx** sheet), "Copy to next week" (asks before replacing, then moves to the copied week). Export opens **timesheet-export.tsx** with this person and week chosen. Shifts from a schedule template are labelled "Schedule Sep 8 – Dec 18"; their sheet says changes are for that day only.

## Edit screens (the pattern to follow)
Every screen that edits and saves data works the same way:
- **No tab bar.** Add the route to `NO_TAB_BAR` in `(teacher)/_layout.tsx` (sheets opened with `presentation: 'modal'` already cover it).
- **Save is pinned to the bottom**, in a footer bar below the scrolling form, where the tab bar was.
- **Save appears only once something has changed.** No changes, no button: compare the form with what it started from (as `templateChanged` does), not "has the user touched anything". Problems that block saving show above the button, and it's disabled while they last.
- **No Cancel.** Back is cancel, but leaving with changes asks first: `useUnsavedChanges(changed)` blocks every way out (header back, Android back, code) and asks with a native alert, like the app's other confirmations: Keep editing, Discard, or Save (`useUnsavedChanges(changed, save)` in `components/common`; leave out `save` while the form can't be saved). After a save or delete succeeds, set a `done` flag that makes `changed` false and go back from an effect, so it doesn't ask about changes now saved. Also set the screen's `headerLeft: unsaved.headerLeft`: iOS's native back button stays dimmed when its press is blocked, so edit screens use a JS back button that looks the same.
- **Destructive actions (Delete) stay at the end of the form**, reached by scrolling, never in the bottom bar.

Screens that run an action rather than save (Export Timesheet, Choose People) also hide the tab bar and pin their one button to the bottom, always shown. Older edit screens (class and student edit, shift and location sheets) predate this; bring them in line when they're next changed.

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
