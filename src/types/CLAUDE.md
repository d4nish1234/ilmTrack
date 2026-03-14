# src/types/

TypeScript interfaces. Exported via `index.ts` barrel file.

## user.types.ts
- `User` — `uid`, `email`, `firstName`, `lastName`, `role` (`'teacher' | 'parent'`), `emailVerified?`, `classIds?` (teacher), `adminClassIds?` (invited teacher), `studentIds?` (parent), `expoPushToken?`
- `UserRole` — `'teacher' | 'parent'`

## class.types.ts
- `Class` — `id`, `name`, `description?`, `teacherId`, `admins: Admin[]`, `studentCount`
- `Admin` — `email`, `userId?`, `inviteStatus`, `inviteSentAt?`, `acceptedAt?`

## student.types.ts
- `Student` — `id`, `firstName`, `lastName`, `classId`, `teacherId`, `parents: Parent[]`, `parentUserIds?: string[]`, `invitedTeacherIds?: string[]`
- `Parent` — `firstName`, `lastName`, `email`, `userId?`, `inviteStatus` (`'pending' | 'sent' | 'accepted'`)
- `CreateStudentData` — `firstName`, `lastName`, `parents[]` (without userId/inviteStatus)

## homework.types.ts
- `Homework` — `id`, `studentId`, `classId`, `teacherId`, `title`, `description?`, `dueDate?`, `status`, `evaluation?`, `parentUserIds?: string[]`, `invitedTeacherIds?: string[]`
- `HomeworkEvaluation` — enum of evaluation levels

## attendance.types.ts
- `Attendance` — `id`, `studentId`, `classId`, `teacherId`, `date`, `status` (`'present' | 'absent' | 'late' | 'excused'`), `notes?`, `parentUserIds?: string[]`, `invitedTeacherIds?: string[]`
