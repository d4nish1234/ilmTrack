/**
 * The teacher's time clock. Every action is a Cloud Function (functions/src/
 * timeclock.ts): the server sets the times and checks the shift, its window,
 * the location and membership. Time entries are read here, never written.
 */
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore, functions } from '../config/firebase';
import type { MyTimekeeping, TimeEntry } from '../types';
import type { ShiftPosition } from './shiftLocation.service';

const call = <T extends object>(name: string) => httpsCallable<T, unknown>(functions, name);

/**
 * `orgIds` are hints from the app (its classes' organizations, and those it
 * administers); the server verifies each one.
 */
export async function getMyTimekeeping(orgIds: string[]): Promise<MyTimekeeping> {
  const result = await httpsCallable<{ orgIds: string[] }, MyTimekeeping>(functions, 'getMyTimekeeping')({ orgIds });
  return result.data;
}

export async function startShift(params: {
  orgId: string;
  weekStart: string;
  shiftId: string;
  position: ShiftPosition;
}): Promise<void> {
  await call<typeof params>('startShift')(params);
}

export async function pauseShift(entryId: string): Promise<void> {
  await call<{ entryId: string }>('pauseShift')({ entryId });
}

export async function resumeShift(entryId: string, position: ShiftPosition): Promise<void> {
  await call<{ entryId: string; position: ShiftPosition }>('resumeShift')({ entryId, position });
}

export async function setShiftNote(entryId: string, note: string): Promise<void> {
  await call<{ entryId: string; note: string }>('setShiftNote')({ entryId, note });
}

/** The teacher's own entries for these weeks, live. */
export function subscribeToMyEntries(
  teacherId: string,
  weekStarts: string[],
  onUpdate: (entries: Map<string, TimeEntry>) => void,
  onError: (error: Error) => void
): () => void {
  if (weekStarts.length === 0) {
    onUpdate(new Map());
    return () => {};
  }
  const q = query(
    collection(firestore, 'timeEntries'),
    where('teacherId', '==', teacherId),
    where('weekStart', 'in', weekStarts.slice(0, 30))
  );
  return onSnapshot(
    q,
    (snap) => onUpdate(new Map(snap.docs.map((d) => [d.id, { ...(d.data() as TimeEntry), id: d.id }]))),
    onError
  );
}

// ─── Ending, including offline ───────────────────────────────────────────

const PENDING_END_KEY = '@ilmtrack/pendingShiftEnd';

interface PendingEnd {
  entryId: string;
  /** When the teacher tapped End. The server only uses it to shorten. */
  endedAt: number;
}

/** Codes meaning the request never got a real answer, worth retrying. */
const RETRYABLE = new Set(['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal']);

export function isRetryable(error: unknown): boolean {
  return RETRYABLE.has((error as { code?: string })?.code ?? '');
}

/**
 * End a shift. Without a connection the end is saved and sent later with the
 * time End was tapped, so a teacher can always end on time.
 *
 * Returns 'queued' when it will be finished later.
 */
export async function endShift(entryId: string): Promise<'done' | 'queued'> {
  const endedAt = Date.now();
  try {
    await call<object>('endShift')({ entryId, endedAt });
    return 'done';
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await AsyncStorage.setItem(PENDING_END_KEY, JSON.stringify({ entryId, endedAt } satisfies PendingEnd));
    return 'queued';
  }
}

/** The end waiting to be sent, if any. */
export async function getPendingEnd(): Promise<PendingEnd | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_END_KEY);
    return raw ? (JSON.parse(raw) as PendingEnd) : null;
  } catch {
    return null;
  }
}

/** Send a saved end. Safe to call repeatedly: ending twice changes nothing. */
export async function flushPendingEnd(): Promise<void> {
  const pending = await getPendingEnd();
  if (!pending) return;
  try {
    await call<object>('endShift')({ entryId: pending.entryId, endedAt: pending.endedAt });
    await AsyncStorage.removeItem(PENDING_END_KEY);
  } catch (error) {
    // Still offline: keep it. Anything else (the shift is gone, or already
    // closed by the server) won't succeed on retry, so drop it.
    if (!isRetryable(error)) await AsyncStorage.removeItem(PENDING_END_KEY);
  }
}

/** The server's own message for a refusal, or a generic one for anything else. */
export function timeclockErrorMessage(error: unknown, fallback: string): string {
  const e = error as { code?: string; message?: string };
  const expected = ['functions/failed-precondition', 'functions/not-found', 'functions/permission-denied', 'functions/invalid-argument'];
  return e?.code && expected.includes(e.code) && e.message ? e.message : fallback;
}

/** The refusal's machine-readable reason ('too-far', 'too-early', ...). */
export function timeclockErrorReason(error: unknown): string | undefined {
  return (error as { details?: { reason?: string } })?.details?.reason;
}
