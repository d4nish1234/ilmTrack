# src/utils/

## parentLinkCleanup.ts
- `unlinkParentsFromStudent(studentId, parents)` — For each parent: removes `studentId` from their user doc's `studentIds`, deletes matching invite docs. Used when removing a parent from a student or deleting a student.
- `unlinkAllParentsFromStudent(studentId)` — Fetches student doc first, then calls `unlinkParentsFromStudent`. Used in `deleteStudent`.

## storage.ts
- AsyncStorage helpers for persisting selected class ID across app restarts.

## authErrors.ts
- Maps Firebase Auth error codes to user-friendly messages.
