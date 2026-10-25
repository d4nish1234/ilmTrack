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

## timesheet.ts
- Admin timesheets: `timesheetRows` (schedule + entries, removed-but-worked shifts kept), `totals` / `workedOfScheduled`, `clockedInNow`, and the CSV (`timesheetCsv`, with formula-injection defused). Tested in `tests/timesheet.test.ts`.

## authErrors.ts
- Maps Firebase Auth error codes to user-friendly messages.
