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

### `get()` in rules DOES work for list queries

This file used to say `get()`-based helpers only work for single-document
reads. That is **wrong**, and it matters: it is the stated justification for
denormalizing `parentUserIds` / `invitedTeacherIds` onto every record.

Measured against the emulator (2026-09-26), a list query authorized purely by
`get()` on another document succeeds:

```
allow read: if request.auth.uid in
  get(/databases/$(database)/documents/classes/$(resource.data.classId)).data.adminUserIds;
```

The real constraint is the **10 document-access calls per query** limit, which
is about *distinct* paths, not result size — identical `get()`s are cached
within one evaluation:

| Distinct classes spanned by one query | Result |
| --- | --- |
| 1, 5, 9, 10 | allowed |
| 11+ | denied |

So a query scoped to one class costs **one** cached read no matter how many
documents come back, and a parent's query scoped to one child likewise. Only a
query spanning 11+ distinct classes breaks. Each `get()` is a billed read.

`isLinkedParent` and `isAdminOfClass` were removed from `firestore.rules`
because they read the *caller's own* user document — a privilege escalation —
not because of any list-query limitation. See `todo.md` #1.

## Key Collections
| Collection | Key Fields | Access |
|---|---|---|
| `users` | `role`, `classIds`, `studentIds`, `adminClassIds`, `emailVerified` | Own profile |
| `classes` | `teacherId`, `admins[]`, `adminUserIds[]`, `studentCount` | Owner + invited teachers |
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

## Access control (post-2026-09-26)

`firestore.rules` decides access **only from the document being accessed** —
never from the caller's own user profile. `users/{uid}.adminClassIds` and
`studentIds` are UI hints with no security meaning; writing them grants nothing.

- **Teachers** — `classes/{id}.adminUserIds` (owner + accepted co-teachers),
  maintained by the `syncClassAdminUserIds` trigger. Never write it from the
  app; the trigger derives it from `admins[]` on every class write, which is
  why older app builds keep working.
- **Records** — `invitedTeacherIds` / `parentUserIds` on each document.
- A co-teacher may update a class but not its `teacherId`, `admins` or
  `adminUserIds`.

## Releases

**When asked to "push a release", ask whether `version` should be bumped before
doing anything else** — it is the one number that is not automatic, and the
version gate depends on it.

### What to bump, and what to leave alone

`eas.json` sets `cli.appVersionSource: "remote"`, so EAS keeps the build
counters on its servers and the production profile has `autoIncrement: true`.

| Field | Where | Who bumps it |
| --- | --- | --- |
| `version` (e.g. `1.3`) | `app.config.js` | **You, by hand.** User-facing, and what `VersionGate` compares |
| `ios.buildNumber` | remote (EAS) | EAS, automatically |
| `android.versionCode` | remote (EAS) | EAS, automatically |

The `buildNumber: '5'` and `versionCode: 3` still sitting in `app.config.js`
are **ignored** — EAS is actually on iOS **20** / Android **14**. EAS itself
warns they should be deleted from the config. They are not the version to bump;
editing them does nothing. Verify anytime with:

```bash
npx eas-cli build:version:get --platform ios
```

Bump `version` when the release changes what users get. Only `version` matters
to the gate, so a release you may later want to require must have a higher
`version` than its predecessor.

### The version gate

`VersionGate` (`src/components/VersionGate.tsx`, mounted above `AuthProvider`)
reads `config/app.minSupportedVersion` from Firestore and blocks builds below
it. It compares against `Constants.expoConfig?.version` — the `version` field
above.

Set the minimum from ilmtrack-admin, **not** in a release:

```bash
npm run min-version              # show current
npm run min-version -- 1.4       # block anything below 1.4
npm run min-version -- --clear   # block nobody
```

**Order matters: ship first, raise the minimum after.** Raising it before the
new build is live and propagated locks users out with nothing to update to.

The gate fails open everywhere — unreadable config, missing field, timeout,
unparseable version. A config mistake must never brick every install.

### There is no OTA

`expo-updates` is deliberately not installed (see `todo.md`), so **every** JS
change needs a store build and review. There is no way to hotfix. Factor the
review turnaround into anything time-sensitive.

### Checklist

1. Ask whether `version` needs bumping; bump it in `app.config.js`
2. `npx vitest run` (needs the Firestore emulator)
3. `eas build --platform ios --profile production` (and/or android)
4. `eas submit --platform ios --profile production`
5. Wait for review, release, and real propagation
6. Only then, if old builds must be cut off: `npm run min-version -- <version>`

## Common Gotchas
- `orderBy` removed from Firestore queries to avoid composite indexes; sorting is done client-side
- When creating student/homework/attendance docs, always include `parentUserIds` and `invitedTeacherIds`
- `homework`/`attendance` store `teacherId` = **the creator**, but `students` store the **class owner** (`add.tsx` fetches it deliberately). Any backfill that filters on `teacherId == classOwner` therefore silently misses everything a co-teacher authored — this caused 243 unreachable records; see `todo.md` #6. Filter on `classId` alone.
- Cloud Functions handle invite acceptance (student doc updates, backfilling access arrays)
- `emailVerified` field on user doc is stamped by client on first verified login; Cloud Function watches for this transition
