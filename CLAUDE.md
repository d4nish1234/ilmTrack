# IlmTrack

Expo React Native app for Islamic school teachers to manage classes, students, homework, and attendance. Parents can view their child's records.

## Tech Stack
- **Frontend**: Expo (React Native), expo-router (file-based routing), react-native-paper (UI)
- **Backend**: Firebase (Auth, Firestore, Cloud Functions v2)
- **Notifications**: Expo Push Notifications
- **Email**: Resend

## Roles
- **Teacher** (class owner): Creates classes, adds students, assigns homework, marks attendance, invites parents, invites co-teachers. Only the class owner can invite co-teachers — invited teachers cannot invite others.
- **Invited Teacher**: Another teacher given shared access to a class via admin invite. Can manage students, homework, and attendance but cannot invite other co-teachers or delete the class. Tracked via `invitedTeacherIds[]` on docs and `adminClassIds[]` on user profile
- **Parent**: Views linked children's homework/attendance. Linked via invite email. Tracked via `parentUserIds[]` on docs and `studentIds[]` on user profile

## Firestore Security Rules Pattern
All list queries MUST include a `where` clause that satisfies the security rule statically:
- **Teacher queries**: `where('teacherId', '==', uid)`
- **Parent queries**: `where('parentUserIds', 'array-contains', uid)`
- **Invited teacher queries**: `where('invitedTeacherIds', 'array-contains', uid)`

`get()`-based rule helpers (`isLinkedParent`, `isAdminOfClass`) only work for single-doc reads, NOT list queries.

## Key Collections
| Collection | Key Fields | Access |
|---|---|---|
| `users` | `role`, `classIds`, `studentIds`, `adminClassIds`, `emailVerified` | Own profile |
| `classes` | `teacherId`, `admins[]`, `studentCount` | Owner + invited teachers |
| `students` | `teacherId`, `classId`, `parents[]`, `parentUserIds[]`, `invitedTeacherIds[]` | Owner + parents + invited teachers |
| `homework` | `teacherId`, `classId`, `studentId`, `parentUserIds[]`, `invitedTeacherIds[]` | Owner + parents + invited teachers |
| `attendance` | `teacherId`, `classId`, `studentId`, `parentUserIds[]`, `invitedTeacherIds[]` | Owner + parents + invited teachers |
| `invites` | `email`, `studentId`, `teacherId`, `status` | Any authenticated user |
| `adminInvites` | `email`, `classId`, `status` | Any authenticated user |

## Project Structure
```
app/              # Expo Router screens (file-based routing)
  (auth)/         # Login, signup, verify-email, forgot-password
  (teacher)/      # Teacher dashboard, classes, students, homework, attendance
  (parent)/       # Parent dashboard, homework list, attendance list
src/
  services/       # Firestore CRUD operations (one per collection)
  contexts/       # React contexts (Auth, ChildFilter, SelectedClass)
  types/          # TypeScript interfaces
  utils/          # Helpers (parentLinkCleanup, storage, authErrors)
  components/     # Shared UI components
  config/         # Firebase config
functions/        # Firebase Cloud Functions (notifications, invite processing)
firestore.rules   # Security rules
tests/            # Firestore rules unit tests (vitest + emulator)
```

## Common Gotchas
- `orderBy` removed from Firestore queries to avoid composite indexes; sorting is done client-side
- When creating student/homework/attendance docs, always include `parentUserIds` and `invitedTeacherIds`
- Cloud Functions handle invite acceptance (student doc updates, backfilling access arrays)
- `emailVerified` field on user doc is stamped by client on first verified login; Cloud Function watches for this transition
