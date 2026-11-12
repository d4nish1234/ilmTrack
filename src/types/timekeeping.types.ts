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
  /**
   * Set when a schedule template wrote this shift. Editing the shift by hand
   * drops it: that day then belongs to the admin, and applying the template
   * again leaves it alone.
   */
  templateId?: string;
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
  /** Ids of template shifts deleted for that day only; templates don't re-add them. */
  skippedTemplateShifts?: string[];
  updatedAt: Timestamp;
  updatedBy: string;
}

/** One time in a schedule template: the same hours on several weekdays. */
export interface TemplateSlot {
  id: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  days: number[];
  /** 'HH:mm', 24-hour, organization time */
  start: string;
  end: string;
  locationId: string;
}

/**
 * scheduleTemplates/{templateId}: a weekly pattern between two dates for a
 * list of teachers ("Term 1: Mon–Thu 4–6 PM, Sep 8 – Dec 18"). Saving one
 * writes its shifts into each teacher's weeks (the saveScheduleTemplate Cloud
 * Function); only the server writes these documents.
 */
export interface ScheduleTemplate {
  id: string;
  orgId: string;
  name: string;
  /** 'yyyy-MM-dd', inclusive */
  startDate: string;
  endDate: string;
  slots: TemplateSlot[];
  teacherIds: string[];
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/** What saving or deleting a template changed (or, as a preview, would change). */
export interface TemplateApplyResult {
  templateId: string;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  teachers: {
    teacherId: string;
    added: number;
    updated: number;
    removed: number;
    /**
     * Up to 20 of the template's shifts that weren't written, and why:
     * another shift at that time, a full week, or a new time that has already
     * passed today (the day keeps its old time).
     */
    skipped: { date: string; start: string; end: string; reason: 'overlap' | 'full' | 'past' }[];
    skippedCount: number;
  }[];
}
