/**
 * Timekeeping setup, written by organization admins.
 *
 * Every write sets absolute values inside a transaction (read, change, write
 * the whole array), so two admins editing at once cannot lose each other's
 * changes and an interrupted save is fixed by saving again.
 */
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../config/firebase';
import type {
  ScheduleTemplate,
  Shift,
  TemplateApplyResult,
  TemplateSlot,
  TimeEntry,
  TimekeepingLocation,
  TimekeepingSettings,
  WeekSchedule,
} from '../types';
import {
  TimekeepingError,
  copyShiftsToWeek,
  scheduleId,
  shiftProblem,
  sortShifts,
} from '../utils/timekeeping';

const schedulesRef = collection(firestore, 'schedules');

/** A fresh Firestore-style id, generated offline, for shifts and locations. */
export function newId(): string {
  return doc(schedulesRef).id;
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ─── Settings ────────────────────────────────────────────────────────────

/** Live settings, or null while timekeeping has never been turned on. */
export function subscribeToTimekeeping(
  orgId: string,
  onUpdate: (settings: TimekeepingSettings | null) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(firestore, 'timekeeping', orgId),
    (snap) => onUpdate(snap.exists() ? (snap.data() as TimekeepingSettings) : null),
    onError
  );
}

/**
 * Turn timekeeping on or off. The first time it is turned on, the document is
 * created with the admin's phone timezone. Turning it off keeps everything.
 */
export async function setTimekeepingEnabled(
  orgId: string,
  enabled: boolean,
  uid: string
): Promise<void> {
  const ref = doc(firestore, 'timekeeping', orgId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.update(ref, { enabled, updatedAt: serverTimestamp(), updatedBy: uid });
    } else {
      tx.set(ref, {
        orgId,
        enabled,
        timezone: deviceTimezone(),
        weekStartsOn: 1,
        locations: [],
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
  });
}

async function updateLocations(
  orgId: string,
  uid: string,
  change: (locations: TimekeepingLocation[]) => TimekeepingLocation[]
): Promise<void> {
  const ref = doc(firestore, 'timekeeping', orgId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new TimekeepingError('Turn on timekeeping first.');
    const current = (snap.data() as TimekeepingSettings).locations ?? [];
    tx.update(ref, {
      locations: change(current),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  });
}

/** Add a location, or replace the one with the same id. */
export function saveLocation(orgId: string, location: TimekeepingLocation, uid: string) {
  return updateLocations(orgId, uid, (locations) => {
    const others = locations.filter((l) => l.id !== location.id);
    return [...others, location].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function deleteLocation(orgId: string, locationId: string, uid: string) {
  return updateLocations(orgId, uid, (locations) => locations.filter((l) => l.id !== locationId));
}

// ─── Schedules ───────────────────────────────────────────────────────────

function toSchedule(id: string, data: Omit<WeekSchedule, 'id'>): WeekSchedule {
  return { ...data, id, shifts: data.shifts ?? [] };
}

/** Every teacher's schedule in this organization for one week, keyed by teacher. */
export function subscribeToOrgWeek(
  orgId: string,
  weekStart: string,
  onUpdate: (byTeacher: Map<string, WeekSchedule>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(schedulesRef, where('orgId', '==', orgId), where('weekStart', '==', weekStart));
  return onSnapshot(
    q,
    (snap) => {
      const byTeacher = new Map<string, WeekSchedule>();
      for (const d of snap.docs) {
        const schedule = toSchedule(d.id, d.data() as Omit<WeekSchedule, 'id'>);
        byTeacher.set(schedule.teacherId, schedule);
      }
      onUpdate(byTeacher);
    },
    onError
  );
}

/** One teacher's shifts for one week; an empty list when none are set. */
export function subscribeToTeacherWeek(
  orgId: string,
  teacherId: string,
  weekStart: string,
  onUpdate: (shifts: Shift[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(schedulesRef, scheduleId(orgId, teacherId, weekStart)),
    (snap) => onUpdate(snap.exists() ? sortShifts((snap.data() as WeekSchedule).shifts ?? []) : []),
    onError
  );
}

/** The most day-only deletions a week remembers (the schedules rule allows 100). */
const SKIPPED_MAX = 100;

async function updateWeek(
  orgId: string,
  teacherId: string,
  weekStart: string,
  uid: string,
  change: (shifts: Shift[], skipped: string[]) => { shifts: Shift[]; skipped?: string[] }
): Promise<void> {
  const ref = doc(schedulesRef, scheduleId(orgId, teacherId, weekStart));
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    const week = snap.exists() ? (snap.data() as WeekSchedule) : null;
    const skipped = week?.skippedTemplateShifts ?? [];
    const next = change(week?.shifts ?? [], skipped);
    const nextSkipped = (next.skipped ?? skipped).slice(-SKIPPED_MAX);
    tx.set(ref, {
      orgId,
      teacherId,
      weekStart,
      shifts: sortShifts(next.shifts),
      // Kept, so a schedule template doesn't bring back a day deleted by hand.
      ...(nextSkipped.length ? { skippedTemplateShifts: nextSkipped } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  });
}

/**
 * Add a shift, or replace the one with the same id. Throws with a message fit
 * to show the admin when it would end before it starts or overlap another.
 *
 * Saving a shift a schedule template wrote makes it this day's own: its
 * templateId is dropped, so applying the template again leaves it as edited.
 * The day is also remembered as the template's no longer, so deleting the
 * edited shift later doesn't let the template bring it back.
 */
export function saveShift(
  orgId: string,
  teacherId: string,
  weekStart: string,
  shift: Shift,
  uid: string
) {
  const { templateId, ...own } = shift;
  return updateWeek(orgId, teacherId, weekStart, uid, (shifts, skipped) => {
    // Checked again here, against the stored week, in case another admin
    // added a shift since the editor opened.
    const problem = shiftProblem(own, shifts);
    if (problem) throw new TimekeepingError(problem);
    return {
      shifts: [...shifts.filter((s) => s.id !== own.id), own],
      skipped: templateId && !skipped.includes(own.id) ? [...skipped, own.id] : skipped,
    };
  });
}

/**
 * Delete a shift. One a schedule template wrote is remembered as deleted for
 * that day, so applying the template again doesn't bring it back.
 */
export function deleteShift(
  orgId: string,
  teacherId: string,
  weekStart: string,
  shiftId: string,
  uid: string
) {
  return updateWeek(orgId, teacherId, weekStart, uid, (shifts, skipped) => {
    const deleted = shifts.find((s) => s.id === shiftId);
    return {
      shifts: shifts.filter((s) => s.id !== shiftId),
      skipped: deleted?.templateId && !skipped.includes(shiftId) ? [...skipped, shiftId] : skipped,
    };
  });
}

/**
 * A week as it was inspected before asking to replace it: how many shifts it
 * had, and its revision (the server time of its last write; null when the week
 * has never been written).
 */
export interface WeekSnapshot {
  count: number;
  revision: number | null;
}

/** Thrown by copyWeek when the target week changed after it was inspected. */
export class WeekChangedError extends TimekeepingError {}

function revisionOf(snap: { exists(): boolean; data(): unknown }): number | null {
  if (!snap.exists()) return null;
  return (snap.data() as WeekSchedule).updatedAt?.toMillis?.() ?? 0;
}

/** Inspect a week before replacing it, so the admin can be asked first. */
export async function inspectWeek(
  orgId: string,
  teacherId: string,
  weekStart: string
): Promise<WeekSnapshot> {
  const snap = await getDoc(doc(schedulesRef, scheduleId(orgId, teacherId, weekStart)));
  return {
    count: snap.exists() ? ((snap.data() as WeekSchedule).shifts ?? []).length : 0,
    revision: revisionOf(snap),
  };
}

/**
 * Replace the target week with this week's shifts, same weekdays and times.
 * One absolute write, so running it twice gives the same result. Returns the
 * number of shifts copied.
 *
 * `expected` is the target week as inspected when the admin was asked (or not
 * asked, because it was empty). If anyone has written that week since, nothing
 * is copied and WeekChangedError is thrown, so the admin is asked again rather
 * than losing a shift another admin just added.
 */
export async function copyWeek(
  orgId: string,
  teacherId: string,
  fromWeekStart: string,
  toWeekStart: string,
  expected: WeekSnapshot,
  uid: string
): Promise<number> {
  const sourceRef = doc(schedulesRef, scheduleId(orgId, teacherId, fromWeekStart));
  const targetRef = doc(schedulesRef, scheduleId(orgId, teacherId, toWeekStart));

  return runTransaction(firestore, async (tx) => {
    const [source, target] = [await tx.get(sourceRef), await tx.get(targetRef)];
    if (revisionOf(target) !== expected.revision) {
      throw new WeekChangedError('Next week was just changed by someone else.');
    }

    const shifts = source.exists() ? ((source.data() as WeekSchedule).shifts ?? []) : [];
    const copied = copyShiftsToWeek(shifts, fromWeekStart, toWeekStart, newId);
    const skipped = target.exists() ? ((target.data() as WeekSchedule).skippedTemplateShifts ?? []) : [];
    tx.set(targetRef, {
      orgId,
      teacherId,
      weekStart: toWeekStart,
      shifts: copied,
      ...(skipped.length ? { skippedTemplateShifts: skipped } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    return copied.length;
  });
}

// ─── Hours worked (admin) ────────────────────────────────────────────────

/**
 * The organization's time entries for one week, live; pass `teacherId` for
 * just one teacher's. Org admins can read them (firestore.rules); only the
 * time-clock Cloud Functions write them. Equality filters only, so no index.
 */
export function subscribeToOrgWeekEntries(
  orgId: string,
  weekStart: string,
  onUpdate: (entries: TimeEntry[]) => void,
  onError: (error: Error) => void,
  teacherId?: string
): () => void {
  const q = query(
    collection(firestore, 'timeEntries'),
    where('orgId', '==', orgId),
    where('weekStart', '==', weekStart),
    ...(teacherId ? [where('teacherId', '==', teacherId)] : [])
  );
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ ...(d.data() as TimeEntry), id: d.id }))),
    onError
  );
}

export interface Correction {
  orgId: string;
  teacherId: string;
  weekStart: string;
  shiftId: string;
  date: string;
  /** 'HH:mm', org time */
  start: string;
  end: string;
  reason: string;
}

/**
 * Set what a teacher actually worked on one shift, or add time for one never
 * started. Server-side (correctTimeEntry): admins only, a reason required, and
 * the teacher's own record is kept.
 */
export async function correctTimeEntry(correction: Correction): Promise<void> {
  await callAdmin('correctTimeEntry', correction);
}

// ─── Schedule templates ──────────────────────────────────────────────────

/** The organization's schedule templates, live, by name. Org admins only. */
export function subscribeToScheduleTemplates(
  orgId: string,
  onUpdate: (templates: ScheduleTemplate[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    query(collection(firestore, 'scheduleTemplates'), where('orgId', '==', orgId)),
    (snap) =>
      onUpdate(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<ScheduleTemplate, 'id'>), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name))
      ),
    onError
  );
}

/** A template as edited in the app. A new one gets its id when the editor opens. */
export interface TemplateDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  slots: TemplateSlot[];
  teacherIds: string[];
}

/**
 * Applying a template rewrites many weeks; the server allows it 300 seconds,
 * so the app waits as long (the default is 70) rather than report a failure
 * for a save that then succeeds.
 */
const TEMPLATE_CALL_TIMEOUT_MS = 300_000;

/** Call an admin Cloud Function, turning its refusals into messages to show. */
async function callAdmin<T>(name: string, data: object, timeout?: number): Promise<T> {
  try {
    return (await httpsCallable<object, T>(functions, name, timeout ? { timeout } : undefined)(data)).data;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    // The server's refusals are written to be shown; anything else isn't.
    if (e.code && e.code !== 'functions/internal' && e.code !== 'functions/unavailable' && e.message) {
      throw new TimekeepingError(e.message);
    }
    throw error;
  }
}

/**
 * Save a template and write it into every week it covers, for everyone on it
 * (saveScheduleTemplate). With `dryRun`, nothing changes and the result says
 * what would, for the preview.
 *
 * `version` says which template this is: a new one (`create`), or the
 * version of an existing one the editor opened (`expectedUpdatedAt`, its
 * updatedAt in milliseconds). The server refuses a save over someone else's
 * newer change.
 */
export function saveScheduleTemplate(
  orgId: string,
  template: TemplateDraft,
  dryRun: boolean,
  version: { create: true } | { create: false; expectedUpdatedAt: number | null }
) {
  return callAdmin<TemplateApplyResult>(
    'saveScheduleTemplate',
    { orgId, template, dryRun, ...version },
    TEMPLATE_CALL_TIMEOUT_MS
  );
}

/** Delete a template and its future shifts (deleteScheduleTemplate); `dryRun` previews. */
export function deleteScheduleTemplate(orgId: string, templateId: string, dryRun: boolean) {
  return callAdmin<TemplateApplyResult>(
    'deleteScheduleTemplate',
    { orgId, templateId, dryRun },
    TEMPLATE_CALL_TIMEOUT_MS
  );
}
