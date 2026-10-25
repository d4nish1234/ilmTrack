import { Timestamp } from 'firebase/firestore';

/**
 * Timekeeping for an organization. Set up by its admins in the Organization
 * tab; teachers only ever see the shifts set for them.
 *
 * Dates and times are wall-clock strings in the organization's timezone
 * ('2026-10-12', '16:00'), never Timestamps, so a shift copied to next week
 * still starts at 4 PM across a daylight-saving change.
 */

/** Where teachers may start a shift. */
export interface TimekeepingLocation {
  id: string;
  name: string;
  /** Human-readable address shown to admins so they can confirm the pin. */
  address?: string;
  latitude: number;
  longitude: number;
  /** How close a teacher must be, in metres. */
  radiusM: number;
}

/** timekeeping/{orgId} */
export interface TimekeepingSettings {
  orgId: string;
  enabled: boolean;
  /** IANA zone, e.g. 'America/Toronto'. Set from the admin's phone when first enabled. */
  timezone: string | null;
  /** 1 = Monday. Fixed for now. */
  weekStartsOn: 1;
  locations: TimekeepingLocation[];
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface Shift {
  id: string;
  /** 'yyyy-MM-dd' */
  date: string;
  /** 'HH:mm', 24-hour */
  start: string;
  /** 'HH:mm', 24-hour, after start (no overnight shifts) */
  end: string;
  /** The name is looked up from the settings, so renaming a location updates every shift. */
  locationId: string;
}

/**
 * One teacher's shifts for one week in one organization:
 * schedules/{orgId}_{teacherId}_{weekStart}.
 *
 * A whole week in one document so "copy to next week" is one absolute write.
 */
export interface WeekSchedule {
  id: string;
  orgId: string;
  teacherId: string;
  /** 'yyyy-MM-dd' of the week's Monday */
  weekStart: string;
  shifts: Shift[];
  updatedAt: Timestamp;
  updatedBy: string;
}
