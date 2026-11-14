# src/utils/

## parentLinkCleanup.ts
- `unlinkParentsFromStudent(studentId, parents)` — For each parent: removes `studentId` from their user doc's `studentIds`, deletes matching invite docs. Used when removing a parent from a student or deleting a student.
- `unlinkAllParentsFromStudent(studentId)` — Fetches student doc first, then calls `unlinkParentsFromStudent`. Used in `deleteStudent`.

## storage.ts
- AsyncStorage helpers for persisting selected class ID across app restarts.

## timekeeping.ts
- Pure week/shift helpers: `weekStartOf` (Monday), `weekDates`, `shiftWeek`, `scheduleId`, `formatTime`, `formatDuration`, `weekSummary`, `shiftProblem` (end-before-start / overlap), `copyShiftsToWeek`. Tested in `tests/timekeeping.test.ts`.

## timeclock.ts
- `focusOf(shifts, now, earlyStartMs)` — what the bar and sheet are about: running / paused / ready / later-today / done-today / upcoming / week-over / none. `workedMs` mirrors the server's capping. `shiftViews` merges the schedule with time entries (an entry's own times win; an entry whose shift was deleted still shows). `barContent` is every Classes-bar state as text; `countingFrom` is when an early start actually counts. Tested in `tests/timeclock.test.ts`.

## weekGrid.ts
- The Timekeeping week grid's logic: `gridCells` (each day's shifts, two shown then "+N"), `rowLines`, `rowHeight` (at least 44 pt), `gridDates` (Mon–Fri always, weekend days only when used), `cellTone` (status → colour), `shortRange` ('4–6', '4:30–6'; no AM/PM), `weekRangeLabel` ('Nov 9 – 15'). Tested in `tests/weekGrid.test.ts`.

## scheduleTemplates.ts
- Schedule templates in the app: `formatDays` ('Mon–Thu'), `slotSummary`, `templateTitle` / `templateDescription` (list rows: dates, then times and people; schedules have no name on screen), `templateName` (the hidden name the server requires, made from dates and first time, at most 60 characters), `templateChanged` (whether the editor has anything to save), `templateProblem` (the editor's checks, same messages as the server's `parseTemplate`), `endAfterStartMoves`, `hasEnded`, and the preview text (`changeSummary`, `skippedLines`). Tested in `tests/scheduleTemplates.test.ts`.

## timesheet.ts
- Admin timesheets: `timesheetRows` (schedule + entries, removed-but-worked shifts kept), `totals` / `workedOfScheduled`, `clockedInNow`, and `STATUS_LABEL`. Tested in `tests/timesheet.test.ts`.
- Choose People (`peoplePicker.ts`): `peopleSummary` (a row's 'Aisha Khan and Omar Ali' / 'All 12 people'), `pickResult`, `filterPeople`. Tested in `tests/peoplePicker.test.ts`.
- Timesheet PDF (`timesheetExport.ts`): date ranges (`rangeProblem`, six months at most; `rangeWeeks`, the Mondays to read; presets), `readChosenOnly` (read just the chosen people's weeks or the whole organization's, whichever reads less), `rowsInRange`, `personTotals`, and `timesheetHtml` for expo-print, with every name, note and location HTML-escaped. Tested in `tests/timesheetExport.test.ts`.

## authErrors.ts
- Maps Firebase Auth error codes to user-friendly messages.
