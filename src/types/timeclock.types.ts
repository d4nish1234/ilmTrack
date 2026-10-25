import { Timestamp } from 'firebase/firestore';

/**
 * The teacher's side of timekeeping. Shifts come from the getMyTimekeeping
 * Cloud Function (teachers can't read an organization's timekeeping settings
 * directly); time entries are read live from Firestore but only ever written
 * by the time-clock functions.
 */

/** A shift as returned by getMyTimekeeping, with exact instants (epoch ms). */
export interface MyShift {
  id: string;
  /** 'yyyy-MM-dd' in the organization's timezone */
  date: string;
  /** 'HH:mm' wall-clock, organization timezone */
  start: string;
  end: string;
  locationId: string;
  locationName: string;
  startAt: number;
  endAt: number;
}

export interface MyOrgTimekeeping {
  orgId: string;
  orgName: string;
  timezone: string;
  /** This week's Monday in the organization's timezone. */
  weekStart: string;
  /** Today in the organization's timezone. */
  today: string;
  shifts: MyShift[];
}

export interface MyTimekeeping {
  /** Server time when this was produced, to correct for a wrong phone clock. */
  now: number;
  earlyStartMs: number;
  orgs: MyOrgTimekeeping[];
}

export type TimeEntryStatus = 'running' | 'paused' | 'done';

/** timeEntries/{orgId}_{teacherId}_{date}_{shiftId} */
export interface TimeEntry {
  id: string;
  orgId: string;
  teacherId: string;
  shiftId: string;
  date: string;
  weekStart: string;
  startAt: Timestamp;
  endAt: Timestamp;
  /** Where the work happened, kept even if the location is later renamed or deleted. */
  locationName: string;
  status: TimeEntryStatus;
  segments: { start: Timestamp; end: Timestamp | null }[];
  note?: string;
  endedBy?: 'teacher' | 'schedule' | 'admin';
  workedMinutes?: number;
  /** The latest admin correction, shown to the teacher as "Edited by admin". */
  correction?: { by: string; at: Timestamp; reason: string };
  /** The teacher's own record before the first correction; null if the admin added the time. */
  original?: { segments: { start: Timestamp; end: Timestamp | null }[]; workedMinutes: number; endedBy: string | null } | null;
}

/** A shift together with its organization, flattened for display. */
export interface ShiftView extends MyShift {
  orgId: string;
  orgName: string;
  weekStart: string;
  /** Today in this shift's organization. */
  today: string;
  entryId: string;
  entry: TimeEntry | null;
}
