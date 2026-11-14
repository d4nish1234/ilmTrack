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
| `organizations` | `name`, `members[]`, `memberUserIds[]` | Read: its admins (`memberUserIds`). Write: ilmtrack-admin only |
| `timekeeping` | doc id = `orgId`; `enabled`, `timezone`, `locations[]` | Org admins (`isOrgAdmin`) |
| `schedules` | doc id = `{orgId}_{teacherId}_{weekStart}`; `shifts[]` | Write: org admins. Read: org admins + that teacher |
| `timeEntries` | doc id = `{orgId}_{teacherId}_{date}_{shiftId}`; `status`, `segments[]`, `locationName`, `workedMinutes` | Read: that teacher + org admins. Write: time-clock Cloud Functions only |
| `activeShifts` | doc id = teacherId; the one open shift | Cloud Functions only |

## Organizations

Created and staffed in ilmtrack-admin; the app only reads them. Two separate
relationships:
- **Administers** an org: listed in `organizations/{id}.memberUserIds`. Only
  these teachers see the Organization tab.
- **Teaches in** an org: owner or co-teacher (`adminUserIds`) of a class whose
  `orgId` points at it. Grants no read of the org document. Derived by
  `orgTeacherIds()` in `organization.service.ts`, never from `adminClassIds` or
  `invitedTeacherIds`.

## Timekeeping

Org admins turn it on per organization, add locations, and set each
teacher's shifts week by week (Organization tab → Timekeeping).
- Shift dates/times are wall-clock strings (`'2026-10-12'`, `'16:00'`) in the
  org's timezone, never Timestamps, so copying a week across a DST change
  keeps 4 PM at 4 PM.
- A teacher's whole week is one `schedules` doc, so "copy to next week" is a
  single absolute write. Edits run in a transaction over the whole array.
- The schedule doc id is checked against its fields in the rules; that is
  also what authorizes reading a week that does not exist yet.
- Rules can't check that a scheduled teacher teaches in the org — the Cloud
  Function that starts a shift must.
- **Teachers record time** through the Time sheet (Classes screen bar). Every
  action is a callable in `functions/src/timeclock.ts`; the server sets the
  times and checks the shift, the 15-minute early-start window, membership
  (teacher of an org class *or* org admin) and location. Clients never write
  `timeEntries` — a client that could would award itself hours.
- **Location is checked, never stored.** Start and Resume send the position;
  the server measures it against the shift's location and allows or refuses.
  Refused only when outside the radius even after allowing for the reading's
  own error (`locationVerdict` in `timeclockCore.ts`), or a mock location. No
  coordinates, distance or verdict are saved, and End sends no position. Keep
  it that way: storing them would be a location history needing store
  declarations. `timeclock.test.ts` asserts nothing location-related is stored.
- **No copied fields** on shifts or entries beyond `timeEntries.locationName`,
  which is history (survives a rename or delete). Shift location names come
  from the settings via `getMyTimekeeping`; org names likewise.
- **Hours are capped** to the scheduled shift on read and on close, so a shift
  left running still counts exactly to its end. `closeFinishedShiftsJob`
  (every 5 min) finalises them via `openUntil`, a field present only on open
  entries — a single-field query, so no composite index.
- **Admin corrections** (`correctTimeEntry`): within the scheduled shift (extend
  the shift first to pay for longer), reason required, teacher's own record
  kept in `original`. Teachers see "Edited by admin" and the reason.
- **Teacher history** (Time sheet → Past weeks): one week at a time from
  `getMyWeek` plus live entries; missed shifts show as "Not started".
  `getMyWeek` still returns a week after timekeeping is turned off, but the
  app only reaches history through the bar, which an org with timekeeping
  off doesn't show.
- **Schedule templates** (`scheduleTemplates/{id}`, Timekeeping → Settings → Schedules):
  a weekly pattern between two dates for chosen people. Saving one runs
  `saveScheduleTemplate`, which writes its shifts into each person's weekly
  `schedules` docs, so nothing that reads schedules needs to know about
  templates. Template shifts carry `templateId` and an id from template, slot
  and date, so applying again is idempotent and worked hours stay linked.
  Applying never touches the past, a shift that has started or can be
  started, shifts added by hand, or a day edited or deleted by hand (both
  record the id in the week's `skippedTemplateShifts`; editing also drops
  `templateId`). If a new time has already passed today, today keeps its old
  time. Only the Cloud Functions write templates; a template stores no
  bookkeeping at rest (`pending` exists only while a save is applying).
  Templates have no name in the app (after 1.8): the server still requires
  `name`, so the app sends one made from the dates and first time
  (`templateName`) and shows the dates instead.
- **One open shift per teacher**, via `activeShifts/{uid}`. Release it only if
  it still points at the entry being closed (back-to-back shifts).
- Teachers can't read `timekeeping/{orgId}`; `getMyTimekeeping` returns their
  week per org (org timezone, enabled orgs only, including orgs where they
  have no shifts yet so the time clock is discoverable) instead.
- Location is foreground-only (`expo-location` plugin in `app.config.js`, no
  background permission). Keep it that way unless the store listings are
  updated too.

## Theme
Everything about the look lives in `src/constants/theme.ts`; screens and
components never hard-code it (`tests/theme.test.ts` fails if they do).
- **Colours by meaning:** `colors.brand` (dark indigo #2c2e78, in `src/constants/brand.json`,
  which `app.config.js` also reads: the header bar, selected tab, splash),
  `primary` (Young Momins' indigo #3b3e9e: everything you tap or that's selected:
  buttons, links, chips, toggles, date and time fields; Paper's primary
  too), `info` (teal: a state, not an action: assigned, excused, on shift,
  ready), `text` / `textSecondary` / `textDisabled`, `background` (white;
  Young Momins' cream is noted beside it) / `card` (raised: cards, inputs,
  menus, pop-ups, sheets) / `surface` / `border` / `divider`, `success` /
  `warning` / `danger` (each with a `…Soft` fill), `star`, `scrim`. One
  shade per meaning. Paper's purple MD3 defaults are mapped to these.
- **Headings** (`typography.display`, `h1`–`h3`) use Young Momins' serif:
  Iowan Old Style on iOS, the phone's serif on Android (as on the site; the
  font is Apple's and can't be shipped). Everything else is the system font.
- **Status colours:** `statusColor(status)` / `statusSoftColor(status)` for
  attendance and homework; don't write another switch.
- **Type scale:** `<Text variant={typography.h2}>` (display, h1–h5,
  bodyLarge, body, caption, label…), never a Paper variant name. Outside a
  Paper Text, `fontSize.*` and `fontWeight.*`.
- **Shape and space:** `radius.*` (8 is the default for buttons and cards;
  circles use half their size), `spacing.*`.
- **Headers:** spread `headerOptions` into a stack's `screenOptions`.
- **One component per job** (`src/components/common` unless noted):
  `Button` (never Paper's directly), `AddButton` (the round floating +), `Tappable` for anything tappable that
  isn't a button, list row or chip (never `TouchableOpacity`), `DateField` and
  `TimeField` (`components/timekeeping`) for every date and time (on iOS a
  `PickerSheet`: the calendar or time wheel in a bottom sheet with Confirm /
  Cancel; on Android the system dialog), `AppSnackbar` for
  messages (not a one-button alert; in a sheet presented as a modal pass
  `wrapInPortal={false}`, or the sheet hides it; inside a pop-up keep an
  alert, which shows above it),
  `HelpSheet` / `HelpLink`, `useUnsavedChanges`. Teacher and parent share
  `SettingsScreen` and `HelpAndSupportScreen` (`components/settings`); their
  routes pass only what differs.
- `colors` is a plain object, so `StyleSheet.create` can use it;
  `useAppTheme()` gives the same values through Paper's theme (its
  `primary`, `secondary`, `error` and the time clock's tones come from
  `colors`).
- The PDF builders (`utils/reportUtils.ts`, `utils/timesheetExport.ts`) have
  their own CSS and are exempt.

## Edit screens
Screens that edit data hide the tab bar, pin Save to the bottom and show it
only once something has changed, have no Cancel (back is cancel, and asks
Keep editing / Discard / Save in a native alert, `useUnsavedChanges`,
when there are changes), and keep Delete at the end of the form. Details in `app/(teacher)/CLAUDE.md` ("Edit
screens"); follow it for every new or reworked edit screen.

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
