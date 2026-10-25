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
  setDoc,
  where,
} from 'firebase/firestore';
import { firestore } from '../config/firebase';
import type { Shift, TimekeepingLocation, TimekeepingSettings, WeekSchedule } from '../types';
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

async function updateWeek(
  orgId: string,
  teacherId: string,
  weekStart: string,
  uid: string,
  change: (shifts: Shift[]) => Shift[]
): Promise<void> {
  const ref = doc(schedulesRef, scheduleId(orgId, teacherId, weekStart));
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as WeekSchedule).shifts ?? []) : [];
    tx.set(ref, {
      orgId,
      teacherId,
      weekStart,
      shifts: sortShifts(change(current)),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  });
}

/**
 * Add a shift, or replace the one with the same id. Throws with a message fit
 * to show the admin when it would end before it starts or overlap another.
 */
export function saveShift(
  orgId: string,
  teacherId: string,
  weekStart: string,
  shift: Shift,
  uid: string
) {
  return updateWeek(orgId, teacherId, weekStart, uid, (shifts) => {
    // Checked again here, against the stored week, in case another admin
    // added a shift since the editor opened.
    const problem = shiftProblem(shift, shifts);
    if (problem) throw new TimekeepingError(problem);
    return [...shifts.filter((s) => s.id !== shift.id), shift];
  });
}

export function deleteShift(
  orgId: string,
  teacherId: string,
  weekStart: string,
  shiftId: string,
  uid: string
) {
  return updateWeek(orgId, teacherId, weekStart, uid, (shifts) =>
    shifts.filter((s) => s.id !== shiftId)
  );
}

/** How many shifts the teacher already has that week. Used to ask before replacing. */
export async function countShifts(orgId: string, teacherId: string, weekStart: string) {
  const snap = await getDoc(doc(schedulesRef, scheduleId(orgId, teacherId, weekStart)));
  return snap.exists() ? ((snap.data() as WeekSchedule).shifts ?? []).length : 0;
}

/**
 * Replace the target week with this week's shifts, same weekdays and times.
 * One absolute write, so running it twice gives the same result. Returns the
 * number of shifts copied.
 */
export async function copyWeek(
  orgId: string,
  teacherId: string,
  fromWeekStart: string,
  toWeekStart: string,
  uid: string
): Promise<number> {
  const source = await getDoc(doc(schedulesRef, scheduleId(orgId, teacherId, fromWeekStart)));
  const shifts = source.exists() ? ((source.data() as WeekSchedule).shifts ?? []) : [];
  const copied = copyShiftsToWeek(shifts, fromWeekStart, toWeekStart, newId);

  await setDoc(doc(schedulesRef, scheduleId(orgId, teacherId, toWeekStart)), {
    orgId,
    teacherId,
    weekStart: toWeekStart,
    shifts: copied,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return copied.length;
}
