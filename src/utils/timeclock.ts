/**
 * Pure logic for the teacher's time clock: which shift matters right now, and
 * how long has been worked. No Firebase, so it is unit-tested directly
 * (tests/timeclock.test.ts).
 *
 * The server is authoritative (it refuses a start outside the window, and
 * caps hours at the shift's end); this only decides what to show.
 */
import { format, parseISO } from 'date-fns';
import type { MyTimekeeping, ShiftView, TimeEntry } from '../types';
import { formatTime } from './timekeeping';

type Millis = { toMillis(): number };

/** Time worked, in ms, counting only time inside the shift. Mirrors the server. */
export function workedMs(
  entry: { segments: { start: Millis; end: Millis | null }[] },
  startAt: number,
  endAt: number,
  now: number
): number {
  let ms = 0;
  for (const s of entry.segments) {
    const from = Math.max(s.start.toMillis(), startAt);
    const to = Math.min(s.end ? s.end.toMillis() : now, endAt);
    if (to > from) ms += to - from;
  }
  return ms;
}

/** '0:42:10' */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** '1h 5m', '45m', '0m' */
export function formatWorked(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Organizations worth asking the server about: those of the teacher's classes,
 * plus those they administer. Empty means the time clock can't apply to them
 * (membership needs one or the other), so the app skips the call entirely.
 */
export function timekeepingOrgHints(
  classes: { orgId?: string }[],
  administeredOrgIds: string[]
): string[] {
  const ids = new Set(administeredOrgIds);
  for (const c of classes) if (c.orgId) ids.add(c.orgId);
  return [...ids].sort();
}

export function entryIdFor(orgId: string, teacherId: string, date: string, shiftId: string): string {
  return `${orgId}_${teacherId}_${date}_${shiftId}`;
}

/** 'HH:mm' as a clock in this IANA zone reads at the instant. */
export function wallTime(ms: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(ms);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return `${get('hour')}:${get('minute')}`;
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Every shift this week across organizations, with its entry, soonest first.
 *
 * Built from the schedule *and* the time entries, because they can disagree
 * once a shift has started:
 * - If an admin edits a shift's times after it starts, the entry keeps the
 *   times it started under, and so does the server's hour count. A shift with
 *   an entry therefore shows the entry's times.
 * - If an admin deletes or moves a shift after it starts, the entry is all
 *   that's left. It still appears, so a running one can still be ended.
 */
export function shiftViews(
  data: MyTimekeeping | null,
  entries: Map<string, TimeEntry>,
  teacherId: string
): ShiftView[] {
  if (!data) return [];
  const orgsById = new Map(data.orgs.map((o) => [o.orgId, o]));
  const fromEntry = (entry: TimeEntry, timeZone: string) => ({
    startAt: entry.startAt.toMillis(),
    endAt: entry.endAt.toMillis(),
    start: wallTime(entry.startAt.toMillis(), timeZone),
    end: wallTime(entry.endAt.toMillis(), timeZone),
  });

  const views: ShiftView[] = data.orgs.flatMap((org) =>
    org.shifts.map((s) => {
      const entryId = entryIdFor(org.orgId, teacherId, s.date, s.id);
      const entry = entries.get(entryId) ?? null;
      return {
        ...s,
        ...(entry ? { ...fromEntry(entry, org.timezone), locationName: entry.locationName } : {}),
        orgId: org.orgId,
        orgName: org.orgName,
        weekStart: org.weekStart,
        today: org.today,
        entryId,
        entry,
      };
    })
  );

  const shown = new Set(views.map((v) => v.entryId));
  for (const entry of entries.values()) {
    if (shown.has(entry.id)) continue;
    const org = orgsById.get(entry.orgId);
    // Only this week's entries of orgs still listed; anything else is history.
    if (!org || entry.weekStart !== org.weekStart) continue;
    views.push({
      id: entry.shiftId,
      date: entry.date,
      locationId: '',
      locationName: entry.locationName,
      ...fromEntry(entry, org.timezone),
      orgId: org.orgId,
      orgName: org.orgName,
      weekStart: org.weekStart,
      today: org.today,
      entryId: entry.id,
      entry,
    });
  }

  return views.sort((a, b) => a.startAt - b.startAt);
}

/**
 * When the shift's time starts counting: the scheduled start, or later if it
 * was started late. Starting early doesn't count early.
 */
export function countingFrom(entry: { segments: { start: Millis }[] }, startAt: number): number | null {
  const first = entry.segments[0]?.start.toMillis();
  return first === undefined ? null : Math.max(first, startAt);
}

export type Focus =
  /** On shift. */
  | { kind: 'running'; shift: ShiftView }
  /** On a break. */
  | { kind: 'paused'; shift: ShiftView }
  /** Can be started now. */
  | { kind: 'ready'; shift: ShiftView }
  /** Later today; can't be started yet. */
  | { kind: 'later-today'; shift: ShiftView }
  /** Today's shifts are over; the latest one worked. */
  | { kind: 'done-today'; shift: ShiftView; workedTodayMs: number }
  /** Nothing today; the next shift this week. */
  | { kind: 'upcoming'; shift: ShiftView }
  /** Nothing left this week. */
  | { kind: 'week-over'; workedWeekMs: number }
  /**
   * In an organization with timekeeping on, but not scheduled this week.
   * Still shown, so teachers know the time clock exists.
   */
  | { kind: 'no-shifts' }
  /** Not in any organization with timekeeping on: show nothing. */
  | { kind: 'none' };

const isOpen = (s: ShiftView) => s.entry?.status === 'running' || s.entry?.status === 'paused';

/**
 * What the bar and the top of the sheet should be about right now.
 * `hasTimekeeping`: the teacher belongs to at least one organization with
 * timekeeping on, scheduled or not.
 */
export function focusOf(
  shifts: ShiftView[],
  now: number,
  earlyStartMs: number,
  hasTimekeeping = shifts.length > 0
): Focus {
  if (shifts.length === 0) return { kind: hasTimekeeping ? 'no-shifts' : 'none' };

  // An open shift whose time is up is about to be closed by the server; treat
  // it as over rather than showing a timer frozen at the end.
  const open = shifts.find((s) => isOpen(s) && now < s.endAt);
  if (open) return { kind: open.entry!.status === 'paused' ? 'paused' : 'running', shift: open };

  const ready = shifts.find(
    (s) => !s.entry && now >= s.startAt - earlyStartMs && now < s.endAt
  );
  if (ready) return { kind: 'ready', shift: ready };

  const today = shifts.filter((s) => s.date === s.today);
  const laterToday = today.find((s) => s.startAt - earlyStartMs > now);
  if (laterToday) return { kind: 'later-today', shift: laterToday };

  const workedToday = today.filter((s) => s.entry);
  if (workedToday.length > 0) {
    return {
      kind: 'done-today',
      shift: workedToday[workedToday.length - 1],
      workedTodayMs: workedToday.reduce((sum, s) => sum + workedMs(s.entry!, s.startAt, s.endAt, now), 0),
    };
  }

  const next = shifts.find((s) => s.startAt > now);
  if (next) return { kind: 'upcoming', shift: next };

  return {
    kind: 'week-over',
    workedWeekMs: shifts.reduce((sum, s) => sum + (s.entry ? workedMs(s.entry, s.startAt, s.endAt, now) : 0), 0),
  };
}

export type BarTone = 'running' | 'paused' | 'ready' | 'idle';

/**
 * What the Classes bar says for a focus: its colour (a theme key), icon,
 * text and the action hint on the right. Pure, so every state is tested.
 */
export function barContent(
  focus: Exclude<Focus, { kind: 'none' }>,
  now: number,
  pendingEndId: string | null
): { tone: BarTone; icon: string; label: string; action: string } {
  let tone: BarTone = 'idle';
  let icon = 'timer-outline';
  let label = '';
  let action = '';

  switch (focus.kind) {
    case 'running': {
      const s = focus.shift;
      tone = 'running';
      icon = 'record-circle-outline';
      // Started early: nothing counts until the scheduled start.
      label =
        now < s.startAt
          ? `On shift · counting from ${formatTime(s.start)}`
          : `On shift · ${formatClock(workedMs(s.entry!, s.startAt, s.endAt, now))}`;
      action = pendingEndId === s.entryId ? 'Ending…' : `Ends ${formatTime(s.end)}`;
      break;
    }
    case 'paused': {
      const s = focus.shift;
      tone = 'paused';
      icon = 'pause-circle-outline';
      label = `On break · ${formatWorked(workedMs(s.entry!, s.startAt, s.endAt, now))} worked`;
      action = 'Resume';
      break;
    }
    case 'ready':
      tone = 'ready';
      label = `Shift ${formatTime(focus.shift.start)}–${formatTime(focus.shift.end)}`;
      action = 'Start';
      break;
    case 'later-today':
      label = `Shift today at ${formatTime(focus.shift.start)}`;
      break;
    case 'done-today':
      icon = 'check-circle-outline';
      label = `Today · ${formatWorked(focus.workedTodayMs)} worked`;
      break;
    case 'upcoming':
      label = `Next shift ${format(parseISO(focus.shift.date), 'EEE')} ${formatTime(focus.shift.start)}`;
      break;
    case 'week-over':
      icon = 'check-circle-outline';
      label = `This week · ${formatWorked(focus.workedWeekMs)} worked`;
      break;
    case 'no-shifts':
      label = 'Time clock · No shifts this week';
      break;
  }


  return { tone, icon, label, action };
}
