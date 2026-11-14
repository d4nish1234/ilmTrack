# app/(teacher)/

Teacher screens. Bottom tab layout: Classes, Organization (only for org admins), Settings.

## organization/
- **index.tsx** — Selected org (switcher when there are several) and its tools list.
- **timekeeping.tsx** — Built around the week: a pager (tap the label for this week), a List | Week toggle, a one-line "N on shift" strip (current week only; tap for a dialog of everyone on shift), then either each person's worked / scheduled hours or the **WeekGrid** (people by day, short times coloured by status; tap an empty day from today on to add a shift (it shows a faint +), a day with one shift to open it, a past empty day, a busier day or a name for that person's week, which opens on the same week). The grid's day header stays in view while scrolling (it's child 2 of the ScrollView, so the children are kept to a fixed five), and List | Week is remembered on the phone (AsyncStorage). Changing weeks fetches only people not loaded yet (`getPeople`); pull-to-refresh reloads everyone. The ⋮ menu holds Settings and Export timesheet (opens **timesheet-export.tsx** on the week being looked at). When timekeeping is off, an explanation and a Turn on button. Every row that opens something has a `›`. A **How timekeeping works** link (above Worked / scheduled, or the grid) opens **timekeeping-help.tsx**, which also opens by itself on this device's first visit once timekeeping is on.
- **timekeeping-settings.tsx** — The on/off switch (turning off asks first), locations (a location opens the **location.tsx** sheet), and a Schedules link (N active) to **schedules.tsx**. Opened from the Timekeeping ⋮ menu. Schedules live here, not on the main screen, so a long people list can't push them out of sight.
- **timekeeping-help.tsx** — What Timekeeping is for (locations, schedules, this week, export) in the shared `HelpSheet`, as a native bottom sheet (`presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`). Closing it, by Got it or a swipe, marks it seen (`markHelpSeen('timekeeping')`).
- **schedules.tsx** — Schedule templates: current and upcoming, Add schedule, ended ones folded under "Ended". A template opens **schedule.tsx**. Opened from Timekeeping Settings.
- **timesheet-export.tsx** — Export Timesheet: People (Everyone, or chosen on **choose-people.tsx**) and Dates (This week / Last week / This month / Last month chips, or From–To, up to six months), then Export PDF pinned to the bottom (no tab bar). Reads the range's weeks once (`getOrgWeeks`) and shares one PDF: a summary, then each person's shifts with notes and admin edits. Everyone also includes people with shifts who have since left; people chosen by name are listed even with no shifts. Up to 10 people (fewer than everyone) are read person by person (`getTeacherWeeks`), otherwise the whole organization's weeks; Export waits for the timekeeping settings so locations and timezone are right. Opened from one person's week, it starts with them chosen.
- **choose-people.tsx** — The shared Choose People screen, for every list that picks people (the export, schedule templates). Open it with `openPeoplePicker({ people, chosen, everyoneOption, onDone })` (`components/timekeeping/peoplePicker.ts`): routes can't return values, so the request and its callback wait there. A filter box (by name, whenever there's more than one person), tick boxes, Select all / Clear (of the people the filter shows: "Select these" while filtering), Continue pinned to the bottom (calls `onDone`); back discards. With `everyoneOption`, ticking everyone returns null ("everyone", which the export widens to people who have left). Logic in `utils/peoplePicker.ts`.
- **schedule.tsx** — Create or edit a schedule template: dates, times (weekdays, location), and People (a row opening **choose-people.tsx**). No name on screen: `templateName` makes the one the server requires from the dates and first time, and lists and labels show the dates instead (`templateTitle`). Follows the edit-screen pattern below (leaving with changes asks Discard / Save): Save and apply appears pinned to the bottom once something has changed (`templateChanged`), Delete is at the end of the form. Save previews with a dry run of `saveScheduleTemplate`, then applies on confirm; Delete previews too. The form follows the stored template until the admin changes something, then keeps their edits and the version they started from (sent so the server can refuse a save over someone else's change). A new template's id is made when the screen opens. Moving Starts past Ends moves Ends along.
- **shift.tsx** — The shift sheet (`ShiftSheet`): the date with a status pill (Upcoming, Not started yet, On shift now, On a break, Worked 1h 50m, Not started), then **Scheduled** (start, end, location) and **Worked** (from, to, total; a Reason box appears once the hours change; notes and earlier admin edits below). An upcoming shift shows only Scheduled; one that has started or is over leads with Worked and folds Scheduled into one line (Change › opens it). A shift never started shows "Add hours worked". One pinned Save, shown only once something changed, saves the plan first and then the hours (`correctTimeEntry` needs the hours within the shift as scheduled, so paying for longer is one save); if the hours fail, Save retries just them. Close (×) asks before discarding; Delete shift (with a confirm) is at the end. A shift deleted after it was worked opens with only Worked. Logic in `utils/shiftSheet.ts`. The route loads params (`teacherId`, `weekStart`, `shiftId` or `date`) and keeps the data live.
- **location.tsx** — Modal sheet wrapping `LocationForm`, loading its own data from `locationId`.
- **teacher/[teacherId].tsx** — One teacher's week: + per day, tap a shift to edit (both open the **shift.tsx** sheet), "Copy to next week" (asks before replacing, then moves to the copied week). Export opens **timesheet-export.tsx** with this person and week chosen. Shifts from a schedule template are labelled "Schedule Sep 8 – Dec 18"; their sheet says changes are for that day only.

## Edit screens (the pattern to follow)
Every screen that edits and saves data works the same way:
- **No tab bar.** Add the route to `NO_TAB_BAR` in `(teacher)/_layout.tsx` (sheets opened with `presentation: 'modal'` already cover it).
- **Save is pinned to the bottom**, in a footer bar below the scrolling form, where the tab bar was.
- **Save appears only once something has changed.** No changes, no button: compare the form with what it started from (as `templateChanged` does), not "has the user touched anything". Problems that block saving show above the button, and it's disabled while they last.
- **No Cancel.** Back is cancel, but leaving with changes asks first: `useUnsavedChanges(changed)` blocks every way out (header back, Android back, code) and asks with a native alert, like the app's other confirmations: Keep editing, Discard, or Save (`useUnsavedChanges(changed, save)` in `components/common`; leave out `save` while the form can't be saved). After a save or delete succeeds, set a `done` flag that makes `changed` false and go back from an effect, so it doesn't ask about changes now saved. Also set the screen's `headerLeft: unsaved.headerLeft`: iOS's native back button stays dimmed when its press is blocked, so edit screens use a JS back button that looks the same.
- **Destructive actions (Delete) stay at the end of the form**, reached by scrolling, never in the bottom bar.

Screens that run an action rather than save (Export Timesheet, Choose People) also hide the tab bar and pin their one button to the bottom, always shown. Older edit screens (class and student edit, shift and location sheets) predate this; bring them in line when they're next changed.

## Feature help (the pattern to follow)
A feature that needs explaining gets a help sheet: what you can do there, as a few icon + title + line rows (`HelpSheet` in `components/common`), in a route presented as a native bottom sheet (`presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`, `sheetGrabberVisible`, no header). Keep it short enough to fit without scrolling.
- **Easy to dismiss:** unlike editors and other sheets (where `gestureEnabled: false` stops a stray swipe losing work), help sheets close by Got it, a swipe down, or a tap on the dimmed screen behind them. Set `gestureEnabled: true` and `sheetLargestUndimmedDetentIndex: 'none'` on the route; the organization stack turns gestures off for everything else.
- **First visit:** the feature's screen opens it by itself if `hasSeenHelp(feature)` (`utils/storage.ts`) is false. Check once per mount (a ref) and only when the feature is usable.
- **Closing marks it seen,** however it's closed (Got it, swipe, or tap outside): the help route calls `markHelpSeen(feature)` when it unmounts, which covers all three. Per device (AsyncStorage), so a new phone shows it again.
- **After that,** a `HelpLink` (bold indigo, circled ! icon) on the screen opens it, placed just above the screen's main list.
- Add the feature's name to `HelpFeature` in `utils/storage.ts`.

## Top-level screens
- **index.tsx** — Home dashboard. Shows class dropdown, today's attendance list (mark present/absent inline), recent homework, quick-assign homework. Uses `subscribeToStudents`, `getStudentAttendanceForDate`, `toggleAttendance`, `createHomework`.
- **settings/index.tsx** — The shared `SettingsScreen` (`components/settings`): profile and edit name, change password, notifications, help, sign out, delete account. This route only loads what deleting the account would remove (the classes it owns and co-teaches) and passes its role's wording.
- **settings/help.tsx** — The shared `HelpAndSupportScreen` (`components/settings`) with this role's getting-started steps and FAQs, pushed from Settings. Not a hidden tab: since expo-router 58, focusing a tab hidden with `href: null` redirects to the first tab.

## classes/
- **index.tsx** — Class list. Uses `subscribeToClasses(teacherId, ...)`.
- **create.tsx** — Create new class form.
- **time.tsx** — The Time sheet (`TimeClockSheet`): start / break / resume / end, the end summary with a note, and this week's shifts. Opened from `TimeClockBar`, a slim colour-coded row under the class picker on the Classes screen (green on shift, amber on break, teal ready, grey otherwise; colours in `src/constants/theme.ts`). Follows the selected class: shown when its org has timekeeping on (even with no shifts yet, so teachers know it exists), hidden for classes outside one. An open shift always shows, whatever class is selected; org admins with no classes see their org. The sheet's **Past weeks** (`TimeHistory`) pages back a week at a time, for the same org.
- **add-attendance.tsx** — The one Add Attendance sheet (`AddAttendanceForm`, params `classId`, `studentId`). Opened by the student screen's Add Attendance button and Attendance History's +. Same reason as add-homework for living here.
- **evaluate-homework.tsx** — Evaluate Homework sheet (`EvaluateHomeworkForm`, param `studentId`), opened by the Classes swipe "Evaluate": rate up to 3 pending items and mark each Complete / Late / Incomplete.
- **add-homework.tsx** — The one Add Homework sheet (`AddHomeworkForm`, params `classId`, `studentId`). Opened by the Classes swipe "New", the student screen's Add Homework button and Homework History's +. Kept in the classes stack so it is always presented as a modal sheet; asks before a second assignment on the same day.

## classes/[classId]/
- **index.tsx** — Class detail: student list + FAB to add student. Uses `subscribeToStudents(classId, teacherId, ...)`.
- **edit.tsx** — Edit class name, manage invited teachers (add/remove admin emails), delete class. Uses `addAdmin`, `removeAdmin`, `deleteClass`.
- **reports.tsx** — From / To dates (the shared `DateField`), then attendance, homework or class-summary reports to preview and export as a PDF. Queries homework and attendance by `classId` and `teacherId`.

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
