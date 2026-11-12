/**
 * Schedule templates: an org admin defines a weekly pattern between two dates
 * for a list of teachers, and the server writes it into every week.
 *
 *   scheduleTemplates/{templateId}   the template (read by the org's admins)
 *   schedules/{orgId}_{teacherId}_{weekStart}   where its shifts are written
 *
 * Templates are written only here, never by clients, because a change has to
 * rewrite many weeks consistently. Each call can be a dry run (`dryRun: true`)
 * that reports what would change, which the app shows before applying.
 *
 * Applying is safe to re-run: it sets each week to the template's latest
 * version (see reconcileWeek), so an interrupted apply is fixed by saving
 * again. It never touches the past, a shift that has started or is about to,
 * or shifts added or edited by hand.
 *
 * While an apply runs, the template also holds `pending`: everyone and every
 * date an earlier version covered that this one doesn't. Saving again (or
 * deleting) revisits those too, so people taken off it lose its shifts even
 * after an interrupted save. It is removed once the apply finishes, so a
 * template at rest stores nothing extra.
 */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { EARLY_START_MS, dateIn, isValidTimeZone, zonedTimeToInstant } from './timeclockCore';
import {
  coverageOf,
  coversAll,
  mergeCoverage,
  parseTemplate,
  reconcileWeek,
  sameTemplate,
  shiftsForWeek,
  weeksBetween,
  type Coverage,
  type SkipReason,
  type StoredShift,
  type TemplateData,
} from './scheduleTemplatesCore';

const REGION = 'us-central1';
/** Shown per teacher at most; the counts are always complete. */
const SKIPPED_LIST_MAX = 20;
/** Teachers applied at once. Each is its own transaction over their weeks. */
const TEACHERS_AT_ONCE = 10;

const db = () => getFirestore();

function fail(code: 'failed-precondition' | 'not-found' | 'permission-denied' | 'invalid-argument', message: string): never {
  throw new HttpsError(code, message);
}

function requireUid(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth.uid;
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(value)) fail('invalid-argument', `Missing ${name}.`);
  return value;
}

/** The org's timezone, location ids and admins, after checking the caller is one. */
async function loadAdminContext(orgId: string, uid: string) {
  const [orgSnap, tkSnap] = await Promise.all([
    db().collection('organizations').doc(orgId).get(),
    db().collection('timekeeping').doc(orgId).get(),
  ]);
  if (!orgSnap.exists || !((orgSnap.data()?.memberUserIds ?? []) as string[]).includes(uid)) {
    fail('permission-denied', "Only this organization's admins can change schedules.");
  }
  const tk = tkSnap.data();
  if (!isValidTimeZone(tk?.timezone)) fail('failed-precondition', 'Turn on timekeeping first.');
  const locationIds = (Array.isArray(tk!.locations) ? tk!.locations : []).map((l: { id?: string }) => l.id);
  return {
    timezone: tk!.timezone as string,
    locationIds: locationIds as string[],
    adminIds: (orgSnap.data()?.memberUserIds ?? []) as string[],
  };
}

/**
 * Refuse people who aren't in the organization: its admins, and whoever
 * teaches one of its classes (the owner or an accepted co-teacher, even one
 * not otherwise in the organization). The same people the app offers. Only
 * people being added are checked, so someone who has left can still be taken
 * off.
 */
async function checkPeople(orgId: string, added: string[], adminIds: string[]) {
  if (added.length === 0) return;
  const allowed = new Set(adminIds);
  const classes = await db().collection('classes').where('orgId', '==', orgId).get();
  for (const c of classes.docs) {
    const { teacherId, adminUserIds } = c.data();
    if (typeof teacherId === 'string') allowed.add(teacherId);
    if (Array.isArray(adminUserIds)) adminUserIds.forEach((uid: string) => allowed.add(uid));
  }
  if (added.some((uid) => !allowed.has(uid))) {
    fail('invalid-argument', "Someone you chose isn't in this organization any more. Go back and open the schedule again.");
  }
}

export interface TeacherResult {
  teacherId: string;
  added: number;
  updated: number;
  removed: number;
  /** Template shifts not written, and why. */
  skipped: { date: string; start: string; end: string; reason: SkipReason }[];
  skippedCount: number;
}

export interface ApplyResult {
  templateId: string;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  teachers: TeacherResult[];
}

/**
 * Bring every affected teacher's weeks in line with `next` (null: the template
 * is being deleted). `covered` is everyone and every date earlier versions
 * wrote to, so teachers taken off it, and weeks it no longer covers, lose its
 * future shifts.
 *
 * One transaction per teacher, reading all their affected weeks, so an admin
 * editing one of those weeks at the same moment can't be overwritten. Several
 * teachers at once, so a big organization finishes in time.
 */
async function apply(options: {
  orgId: string;
  templateId: string;
  covered: Coverage | null;
  next: TemplateData | null;
  timezone: string;
  uid: string;
  dryRun: boolean;
}): Promise<ApplyResult> {
  const { orgId, templateId, covered, next, timezone, uid, dryRun } = options;
  const now = Date.now();
  const today = dateIn(timezone, now);
  const instant = (s: StoredShift) => zonedTimeToInstant(s.date, s.start, timezone);
  // Started, or startable (from 15 minutes before): it may have hours.
  const isFixed = (s: StoredShift) => instant(s) <= now + EARLY_START_MS;
  const canCreate = (s: StoredShift) => instant(s) > now;

  // From the earliest day either version covers (but not before today) to the
  // latest: a template starting next term doesn't read every week until then.
  const span = mergeCoverage(covered, next && coverageOf(next));
  const firstDay = span && span.startDate > today ? span.startDate : today;
  const weeks = span && span.endDate >= firstDay ? weeksBetween(firstDay, span.endDate) : [];
  const teacherIds = span?.teacherIds ?? [];

  const result: ApplyResult = { templateId, added: 0, updated: 0, removed: 0, skipped: 0, teachers: [] };
  if (weeks.length === 0) return result;

  const applyTeacher = async (teacherId: string): Promise<TeacherResult> => {
    const onTemplate = !!next && next.teacherIds.includes(teacherId);
    const refs = weeks.map((w) => db().collection('schedules').doc(`${orgId}_${teacherId}_${w}`));

    // A preview only reads; a server transaction would lock the weeks it reads.
    const inTransaction = <T>(work: (tx: FirebaseFirestore.Transaction | null) => Promise<T>) =>
      dryRun ? work(null) : db().runTransaction((tx) => work(tx));

    return inTransaction(async (tx) => {
      const snaps = tx ? await tx.getAll(...refs) : await db().getAll(...refs);
      const teacher: TeacherResult = { teacherId, added: 0, updated: 0, removed: 0, skipped: [], skippedCount: 0 };
      snaps.forEach((snap, i) => {
        const data = snap.data() ?? {};
        const change = reconcileWeek({
          current: (Array.isArray(data.shifts) ? data.shifts : []) as StoredShift[],
          desired: onTemplate ? shiftsForWeek(next!, templateId, weeks[i]) : [],
          templateId,
          dayOnly: Array.isArray(data.skippedTemplateShifts) ? (data.skippedTemplateShifts as string[]) : [],
          isFixed,
          canCreate,
        });
        teacher.added += change.added.length;
        teacher.updated += change.updated.length;
        teacher.removed += change.removed.length;
        teacher.skippedCount += change.skipped.length;
        for (const { shift, reason } of change.skipped) {
          if (teacher.skipped.length < SKIPPED_LIST_MAX) {
            teacher.skipped.push({ date: shift.date, start: shift.start, end: shift.end, reason });
          }
        }
        if (tx && change.changed) {
          // Merge: keeps the week's other fields (its day-only deletions).
          tx.set(
            snap.ref,
            {
              orgId,
              teacherId,
              weekStart: weeks[i],
              shifts: change.shifts,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: uid,
            },
            { merge: true }
          );
        }
      });
      return teacher;
    });
  };

  for (let i = 0; i < teacherIds.length; i += TEACHERS_AT_ONCE) {
    const summaries = await Promise.all(teacherIds.slice(i, i + TEACHERS_AT_ONCE).map(applyTeacher));
    for (const summary of summaries) {
      result.added += summary.added;
      result.updated += summary.updated;
      result.removed += summary.removed;
      result.skipped += summary.skippedCount;
      if (summary.added + summary.updated + summary.removed + summary.skippedCount > 0) {
        result.teachers.push(summary);
      }
    }
  }
  return result;
}

function storedTemplate(data: FirebaseFirestore.DocumentData | undefined): TemplateData | null {
  if (!data) return null;
  return {
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    slots: data.slots ?? [],
    teacherIds: data.teacherIds ?? [],
  };
}

function storedPending(data: FirebaseFirestore.DocumentData | undefined): Coverage | null {
  const p = data?.pending;
  if (!p || !Array.isArray(p.teacherIds) || typeof p.startDate !== 'string' || typeof p.endDate !== 'string') return null;
  return { teacherIds: p.teacherIds, startDate: p.startDate, endDate: p.endDate };
}

const STALE = 'Someone else changed this schedule while you were editing it. Go back and open it again to see their changes.';

/**
 * Create or change a template and apply it straight away. The app sends the
 * template's id even for a new one (`create: true`), so a retried save
 * changes the same template instead of making a second. To change an existing
 * one it sends `expectedUpdatedAt`, the version it opened: a save over someone
 * else's newer change is refused, unless it is the same template (a retry).
 * With `dryRun`, nothing is written and the result says what would change.
 */
export const saveScheduleTemplate = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const orgId = requireId(data.orgId, 'organization');
  const dryRun = data.dryRun === true;
  const create = data.create === true;
  const expectedUpdatedAt = typeof data.expectedUpdatedAt === 'number' ? data.expectedUpdatedAt : null;
  const { timezone, locationIds, adminIds } = await loadAdminContext(orgId, uid);

  const parsed = parseTemplate(data.template, locationIds);
  if (!parsed.ok) fail('invalid-argument', parsed.message);
  const next = parsed.template;

  const rawId = (data.template as { id?: unknown }).id;
  const ref =
    rawId === undefined || rawId === null
      ? db().collection('scheduleTemplates').doc()
      : db().collection('scheduleTemplates').doc(requireId(rawId, 'schedule'));

  /** Checks the stored version and works out what applying must revisit. */
  const plan = async (existing: FirebaseFirestore.DocumentSnapshot) => {
    if (existing.exists && existing.data()?.orgId !== orgId) fail('not-found', 'That schedule no longer exists.');
    if (!existing.exists && rawId && !create) fail('not-found', 'That schedule no longer exists. Someone may have deleted it.');
    const previous = storedTemplate(existing.data());
    if (previous && !sameTemplate(previous, next)) {
      const stored = (existing.data()?.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? null;
      if (create || expectedUpdatedAt !== stored) fail('failed-precondition', STALE);
    }
    const covered = mergeCoverage(previous && coverageOf(previous), storedPending(existing.data()));
    return { covered, existing };
  };

  let covered: Coverage | null;
  if (dryRun) {
    ({ covered } = await plan(await ref.get()));
    await checkPeople(orgId, next.teacherIds.filter((t) => !covered?.teacherIds.includes(t)), adminIds);
  } else {
    // Checked and saved together, so two admins saving at once can't both
    // pass the check. Saved before applying: if applying is interrupted,
    // saving again finishes it, and `pending` remembers what to revisit.
    covered = await db().runTransaction(async (tx) => {
      const { covered, existing } = await plan(await tx.get(ref));
      await checkPeople(orgId, next.teacherIds.filter((t) => !covered?.teacherIds.includes(t)), adminIds);
      const pending = coversAll(coverageOf(next), covered) ? null : covered;
      tx.set(
        ref,
        {
          orgId,
          ...next,
          pending: pending ?? FieldValue.delete(),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: uid }),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        },
        { merge: true }
      );
      return covered;
    });
  }

  const result = await apply({ orgId, templateId: ref.id, covered, next, timezone, uid, dryRun });
  if (!dryRun && !coversAll(coverageOf(next), covered)) {
    // Everything earlier versions covered has been revisited.
    await ref.update({ pending: FieldValue.delete() });
  }
  return result;
});

/**
 * Delete a template and its future shifts. Shifts that have started or
 * already happened stay, with their hours. With `dryRun`, reports what would
 * be removed.
 */
export const deleteScheduleTemplate = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const orgId = requireId(data.orgId, 'organization');
  const templateId = requireId(data.templateId, 'schedule');
  const dryRun = data.dryRun === true;
  const { timezone } = await loadAdminContext(orgId, uid);

  const ref = db().collection('scheduleTemplates').doc(templateId);
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.orgId !== orgId) fail('not-found', 'That schedule no longer exists.');
  const stored = storedTemplate(existing.data())!;

  const result = await apply({
    orgId,
    templateId,
    covered: mergeCoverage(coverageOf(stored), storedPending(existing.data())),
    next: null,
    timezone,
    uid,
    dryRun,
  });
  // Deleted last: if removing its shifts is interrupted, deleting again finishes it.
  if (!dryRun) await ref.delete();
  return result;
});
