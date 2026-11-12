/**
 * Schedule templates, pure logic: no Firestore, so it is unit-tested directly
 * (tests/scheduleTemplatesCore.test.ts). The callables in scheduleTemplates.ts
 * use it.
 *
 * A template is a weekly pattern ("Mon–Thu 4–6 PM at Main campus") between two
 * dates, for a list of teachers. Applying it writes real shifts into each
 * teacher's weekly schedule documents, so everything that reads schedules —
 * the time clock, timesheets, corrections, history — works unchanged.
 *
 * Every shift a template writes carries its `templateId` and an id derived
 * from the template, slot and date. That makes applying idempotent: running it
 * again replaces the template's own future shifts with the same ids instead of
 * adding more, and hours already worked stay linked to their shift.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9]{1,128}$/;

export const TEMPLATE_LIMITS = {
  nameMax: 60,
  slotsMax: 10,
  teachersMax: 200,
  /** A template covers at most a year, which bounds the writes one apply makes. */
  spanDaysMax: 366,
  /** The schedules rule allows 50 shifts in one teacher's week. */
  shiftsPerWeekMax: 50,
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface TemplateSlot {
  id: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** 'HH:mm', org time */
  start: string;
  end: string;
  locationId: string;
}

export interface TemplateData {
  name: string;
  /** 'yyyy-MM-dd', inclusive */
  startDate: string;
  endDate: string;
  slots: TemplateSlot[];
  teacherIds: string[];
}

/** A shift as stored in a week's `shifts` array. */
export interface StoredShift {
  id: string;
  date: string;
  start: string;
  end: string;
  locationId: string;
  /** Set on shifts a template wrote; absent on ones added or edited by hand. */
  templateId?: string;
}

// ─── Dates ───────────────────────────────────────────────────────────────

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** A real calendar date in 'yyyy-MM-dd' form (rejects 2026-02-30). */
export function isRealDate(date: unknown): date is string {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false;
  return new Date(toUtc(date)).toISOString().slice(0, 10) === date;
}

export function addDaysTo(date: string, days: number): string {
  return new Date(toUtc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

export function mondayOfDate(date: string): string {
  return addDaysTo(date, 1 - isoWeekday(date));
}

/** Every week's Monday from the week of `from` to the week of `to`. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let w = mondayOfDate(from); w <= to; w = addDaysTo(w, 7)) weeks.push(w);
  return weeks;
}

// ─── Validation ──────────────────────────────────────────────────────────

export type ParseResult = { ok: true; template: TemplateData } | { ok: false; message: string };

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  a.start < b.end && b.start < a.end;

/**
 * Check a template sent by an admin's app. Templates are written only by the
 * server, so this is the one place they're validated; every message is meant
 * to be shown to the admin.
 */
export function parseTemplate(value: unknown, locationIds: string[]): ParseResult {
  if (!value || typeof value !== 'object') return { ok: false, message: 'The schedule is missing.' };
  const v = value as Record<string, unknown>;
  const fail = (message: string): ParseResult => ({ ok: false, message });

  const name = typeof v.name === 'string' ? v.name.trim() : '';
  if (!name) return fail('Give the schedule a name.');
  if (name.length > TEMPLATE_LIMITS.nameMax) return fail(`Keep the name under ${TEMPLATE_LIMITS.nameMax} characters.`);

  if (!isRealDate(v.startDate) || !isRealDate(v.endDate)) return fail('Choose a start and end date.');
  if (v.endDate < v.startDate) return fail('The end date must be on or after the start date.');
  if (daysBetween(v.startDate, v.endDate) >= TEMPLATE_LIMITS.spanDaysMax) {
    return fail('A schedule can cover at most a year.');
  }

  if (!Array.isArray(v.slots) || v.slots.length === 0) return fail('Add at least one time.');
  if (v.slots.length > TEMPLATE_LIMITS.slotsMax) return fail(`A schedule can have at most ${TEMPLATE_LIMITS.slotsMax} times.`);
  const slots: TemplateSlot[] = [];
  for (const raw of v.slots as unknown[]) {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (typeof s.id !== 'string' || !ID_RE.test(s.id) || slots.some((o) => o.id === s.id)) {
      return fail('One of the times is not valid. Remove it and add it again.');
    }
    const days = Array.isArray(s.days)
      ? [...new Set(s.days as unknown[])].filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)
      : [];
    if (days.length === 0 || days.length !== (s.days as unknown[]).length) return fail('Choose the days for each time.');
    if (typeof s.start !== 'string' || !TIME_RE.test(s.start) || typeof s.end !== 'string' || !TIME_RE.test(s.end)) {
      return fail('One of the times is not valid.');
    }
    if (s.start >= s.end) return fail('Each time must end after it starts.');
    if (typeof s.locationId !== 'string' || !locationIds.includes(s.locationId)) {
      return fail('Choose a location for each time.');
    }
    slots.push({ id: s.id, days: days.sort((a, b) => a - b), start: s.start, end: s.end, locationId: s.locationId });
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const shared = slots[i].days.find((d) => slots[j].days.includes(d));
      if (shared && overlaps(slots[i], slots[j])) {
        return fail(`Two times overlap on ${DAY_NAMES[shared - 1]}.`);
      }
    }
  }

  if (!Array.isArray(v.teacherIds) || v.teacherIds.length === 0) return fail('Choose at least one person.');
  const teacherIds = [...new Set(v.teacherIds as unknown[])];
  if (teacherIds.some((t) => typeof t !== 'string' || !ID_RE.test(t))) return fail('One of the teachers is not valid.');
  if (teacherIds.length > TEMPLATE_LIMITS.teachersMax) {
    return fail(`A schedule can be for at most ${TEMPLATE_LIMITS.teachersMax} people.`);
  }

  return {
    ok: true,
    template: { name, startDate: v.startDate, endDate: v.endDate, slots, teacherIds: teacherIds as string[] },
  };
}

/** The same template, ignoring the order of keys (Firestore doesn't keep it). */
export function sameTemplate(a: TemplateData, b: TemplateData): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value as object)
              .sort()
              .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
          )
        : value;
  const pick = (t: TemplateData) => ({
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    slots: t.slots,
    teacherIds: t.teacherIds,
  });
  return JSON.stringify(canonical(pick(a))) === JSON.stringify(canonical(pick(b)));
}

// ─── Coverage ────────────────────────────────────────────────────────────

/**
 * Who and which dates a template has written shifts for. Applying a new
 * version has to revisit everything the old one covered, so people taken off
 * it and weeks it no longer covers lose its future shifts.
 */
export interface Coverage {
  teacherIds: string[];
  startDate: string;
  endDate: string;
}

export const coverageOf = (t: Pick<TemplateData, 'teacherIds' | 'startDate' | 'endDate'>): Coverage => ({
  teacherIds: t.teacherIds,
  startDate: t.startDate,
  endDate: t.endDate,
});

/** Everyone and every date in either; null when both are. */
export function mergeCoverage(a: Coverage | null | undefined, b: Coverage | null | undefined): Coverage | null {
  if (!a || !b) return a ?? b ?? null;
  return {
    teacherIds: [...new Set([...a.teacherIds, ...b.teacherIds])],
    startDate: a.startDate < b.startDate ? a.startDate : b.startDate,
    endDate: a.endDate > b.endDate ? a.endDate : b.endDate,
  };
}

/** True when `outer` includes everyone and every date in `inner`. */
export function coversAll(outer: Coverage, inner: Coverage | null): boolean {
  if (!inner) return true;
  return (
    inner.teacherIds.every((t) => outer.teacherIds.includes(t)) &&
    outer.startDate <= inner.startDate &&
    outer.endDate >= inner.endDate
  );
}

// ─── Generating and reconciling ──────────────────────────────────────────

/** The id a template's shift gets: stable across applies, so hours stay linked. */
export const templateShiftId = (templateId: string, slotId: string, date: string) =>
  `${templateId}-${slotId}-${date}`;

/** The template's shifts in one week (Monday `weekStart`), within its dates. */
export function shiftsForWeek(template: TemplateData, templateId: string, weekStart: string): StoredShift[] {
  const shifts: StoredShift[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysTo(weekStart, i);
    if (date < template.startDate || date > template.endDate) continue;
    for (const slot of template.slots) {
      if (!slot.days.includes(i + 1)) continue;
      shifts.push({
        id: templateShiftId(templateId, slot.id, date),
        date,
        start: slot.start,
        end: slot.end,
        locationId: slot.locationId,
        templateId,
      });
    }
  }
  return shifts;
}

/**
 * - overlap: another shift is at that time.
 * - full: the week already has the most shifts allowed.
 * - past: the new time has already passed today, so the day keeps its old time.
 */
export type SkipReason = 'overlap' | 'full' | 'past';

export interface WeekChange {
  shifts: StoredShift[];
  added: StoredShift[];
  updated: StoredShift[];
  removed: StoredShift[];
  skipped: { shift: StoredShift; reason: SkipReason }[];
  changed: boolean;
}

const sameShift = (a: StoredShift, b: StoredShift) =>
  a.date === b.date && a.start === b.start && a.end === b.end && a.locationId === b.locationId && a.templateId === b.templateId;

const byTime = (a: StoredShift, b: StoredShift) =>
  a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date);

/**
 * One teacher's week after applying a template's latest version.
 *
 * - `current`: the week's shifts now.
 * - `desired`: the template's shifts for this teacher and week (none when the
 *   teacher was taken off it, or the template is being deleted).
 * - `dayOnly`: ids of the template's shifts an admin deleted for one day; they
 *   stay deleted.
 * - `isFixed(shift)`: true when a shift has started or is about to (it may
 *   already have hours): it is never changed or removed.
 * - `canCreate(shift)`: false for a time already past; templates don't write
 *   into the past. When one of its shifts later today would move to a time
 *   that has passed, the day keeps its old time rather than losing its shift.
 *
 * Only the template's own shifts are touched. Shifts added by hand, edited
 * for one day (which drops their templateId), or written by another template
 * stay as they are; a template shift that would overlap one is skipped and
 * reported rather than overwriting it.
 */
export function reconcileWeek(input: {
  current: StoredShift[];
  desired: StoredShift[];
  templateId: string;
  dayOnly: string[];
  isFixed: (shift: StoredShift) => boolean;
  canCreate: (shift: StoredShift) => boolean;
}): WeekChange {
  const { current, desired, templateId, dayOnly, isFixed, canCreate } = input;
  const mine = (s: StoredShift) => s.templateId === templateId;
  const currentMine = new Map(current.filter(mine).map((s) => [s.id, s]));

  const kept = current.filter((s) => !mine(s) || isFixed(s));
  const keptIds = new Set(kept.map((s) => s.id));
  const result = [...kept];
  const skipped: WeekChange['skipped'] = [];

  for (const shift of desired) {
    // The fixed or hand-edited version of this day wins; so does a deletion.
    if (keptIds.has(shift.id) || dayOnly.includes(shift.id)) continue;
    if (!canCreate(shift)) {
      const old = currentMine.get(shift.id);
      if (old) {
        result.push(old);
        skipped.push({ shift, reason: 'past' });
      }
      continue;
    }
    if (result.some((o) => o.date === shift.date && overlaps(o, shift))) {
      skipped.push({ shift, reason: 'overlap' });
      continue;
    }
    if (result.length >= TEMPLATE_LIMITS.shiftsPerWeekMax) {
      skipped.push({ shift, reason: 'full' });
      continue;
    }
    result.push(shift);
  }

  const before = new Map(current.map((s) => [s.id, s]));
  const after = new Map(result.map((s) => [s.id, s]));
  const added = result.filter((s) => !before.has(s.id));
  const updated = result.filter((s) => before.has(s.id) && !sameShift(before.get(s.id)!, s));
  const removed = current.filter((s) => !after.has(s.id));

  return {
    shifts: result.sort(byTime),
    added,
    updated,
    removed,
    skipped,
    changed: added.length + updated.length + removed.length > 0,
  };
}
