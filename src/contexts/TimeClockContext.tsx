import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useOrganizations } from './OrganizationContext';
import { useClasses } from '../hooks/useClasses';
import { useSelectedClass } from './SelectedClassContext';
import {
  endShift,
  flushPendingEnd,
  getMyTimekeeping,
  getPendingEnd,
  pauseShift,
  resumeShift,
  setShiftNote,
  startShift,
  subscribeToMyEntries,
  timeclockErrorMessage,
  timeclockErrorReason,
} from '../services/timeclock.service';
import { getShiftPosition, type PositionProblem } from '../services/shiftLocation.service';
import { focusOf, shiftViews, timeClockScope, timekeepingOrgHints, type Focus } from '../utils/timeclock';
import { currentWeekStart, todayIn } from '../utils/timekeeping';
import type { MyOrgTimekeeping, MyTimekeeping, ShiftView, TimeEntry } from '../types';

export type ActionResult =
  | { ok: true; queued?: boolean }
  | { ok: false; message: string; problem?: PositionProblem; reason?: string };

interface TimeClockContextType {
  /** This week's shifts in the organizations shown (see timeClockScope). */
  shifts: ShiftView[];
  /** The organizations shown: usually just the selected class's. */
  orgs: MyOrgTimekeeping[];
  /** Every shift this week, in every organization (for a just-ended one). */
  allShifts: ShiftView[];
  focus: Focus;
  /** Server-corrected now, ticking every second while on shift. */
  now: number;
  /** How early a shift can be started (from the server). */
  earlyStartMs: number;
  loading: boolean;
  /** An end saved offline, still to be sent. */
  pendingEndId: string | null;
  refresh: () => Promise<void>;
  start: (shift: ShiftView) => Promise<ActionResult>;
  pause: (shift: ShiftView) => Promise<ActionResult>;
  resume: (shift: ShiftView) => Promise<ActionResult>;
  end: (shift: ShiftView) => Promise<ActionResult>;
  saveNote: (entryId: string, note: string) => Promise<ActionResult>;
}

const TimeClockContext = createContext<TimeClockContextType | undefined>(undefined);

const GENERIC = "Couldn't reach ilmTrack. Check your connection and try again.";
/** Used only until the server's value arrives (getMyTimekeeping's earlyStartMs). */
const DEFAULT_EARLY_START_MS = 15 * 60_000;

/**
 * The teacher's time clock: this week's shifts (from getMyTimekeeping), the
 * live time entries, and the actions. Mounted in the teacher layout so the
 * Classes bar and the Time sheet share one copy.
 */
export function TimeClockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.role === 'teacher' ? user.uid : undefined;
  const { classes } = useClasses();
  const { organizations } = useOrganizations();
  const { selectedClassId } = useSelectedClass();
  const selectedOrgId = classes.find((c) => c.id === selectedClassId)?.orgId;
  // A string so the effects below re-run only when the set actually changes —
  // for example when a class is added to an organization, live.
  const hintKey = useMemo(
    () => timekeepingOrgHints(classes, organizations.map((o) => o.id)).join(','),
    [classes, organizations]
  );

  const [data, setData] = useState<MyTimekeeping | null>(null);
  const [entries, setEntries] = useState<Map<string, TimeEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pendingEndId, setPendingEndId] = useState<string | null>(null);
  // Server time minus phone time, so a wrong phone clock doesn't skew timers.
  const skew = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      await flushPendingEnd(uid);
      setPendingEndId((await getPendingEnd(uid))?.entryId ?? null);
      if (!hintKey) {
        // No class in an organization and none administered: the time clock
        // can't apply, so don't spend a function call and reads finding out.
        setData(null);
        return;
      }
      const result = await getMyTimekeeping(hintKey.split(','));
      skew.current = result.now - Date.now();
      setData(result);
    } catch (error) {
      // Keep what we had; the next foreground or action tries again.
      console.warn('Could not load shifts:', error);
    } finally {
      setLoading(false);
    }
  }, [uid, hintKey]);

  useEffect(() => {
    if (!uid) {
      setData(null);
      setLoading(false);
      return;
    }
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [uid, refresh]);

  // Each organization's week, plus the phone's: an open shift in an org no
  // longer listed (timekeeping turned off mid-shift) must stay visible so it
  // can be ended.
  const weekKey = useMemo(
    () =>
      data
        ? [...new Set([...data.orgs.map((o) => o.weekStart), currentWeekStart(null)])].sort().join(',')
        : '',
    [data]
  );
  useEffect(() => {
    if (!uid) return;
    return subscribeToMyEntries(uid, weekKey ? weekKey.split(',') : [], setEntries, (error) =>
      console.warn('Could not load time entries:', error)
    );
  }, [uid, weekKey]);

  const allShifts = useMemo(() => (uid ? shiftViews(data, entries, uid) : []), [data, entries, uid]);

  // `today` and `weekStart` come from the server, so they'd go stale if the
  // app stays open past midnight in an organization: fetch again then, once.
  const fetchedDay = useRef<string | null>(null);
  const dayKey = (data?.orgs ?? []).map((o) => todayIn(o.timezone, new Date(now))).join(',');
  const listedDay = (data?.orgs ?? []).map((o) => o.today).join(',');
  useEffect(() => {
    if (dayKey === listedDay || fetchedDay.current === dayKey) return;
    fetchedDay.current = dayKey;
    refresh();
  }, [dayKey, listedDay, refresh]);
  // Re-derived as the clock ticks, so a shift ending in another org hands the
  // bar back to the selected class's.
  const hasClasses = classes.length > 0;
  const { orgs, shifts } = useMemo(() => {
    const scope = timeClockScope(allShifts, (data?.orgs ?? []).map((o) => o.orgId), now, {
      selectedOrgId,
      hasClasses,
      administeredOrgIds: organizations.map((o) => o.id),
    });
    return {
      orgs: (data?.orgs ?? []).filter((o) => scope.includes(o.orgId)),
      shifts: allShifts.filter((s) => scope.includes(s.orgId)),
    };
  }, [allShifts, data, now, selectedOrgId, hasClasses, organizations]);
  const hasTimekeeping = orgs.length > 0;
  const focus = useMemo(
    () => focusOf(shifts, now, data?.earlyStartMs ?? DEFAULT_EARLY_START_MS, hasTimekeeping),
    [shifts, now, data?.earlyStartMs, hasTimekeeping]
  );

  // Every second on shift (the live timer); otherwise often enough to notice
  // a start window opening.
  const ticking = focus.kind === 'running' || focus.kind === 'paused';
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), ticking ? 1000 : 30_000);
    setNow(Date.now() + skew.current);
    return () => clearInterval(id);
  }, [ticking]);

  /** Run an action that needs the teacher's position. */
  const withPosition = useCallback(
    async (action: (position: Parameters<typeof startShift>[0]['position']) => Promise<void>): Promise<ActionResult> => {
      const result = await getShiftPosition();
      if (!result.ok) return { ok: false, message: '', problem: result.problem };
      try {
        await action(result.position);
        await refresh();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: timeclockErrorMessage(error, GENERIC), reason: timeclockErrorReason(error) };
      }
    },
    [refresh]
  );

  const plain = useCallback(
    async (action: () => Promise<void>): Promise<ActionResult> => {
      try {
        await action();
        await refresh();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: timeclockErrorMessage(error, GENERIC), reason: timeclockErrorReason(error) };
      }
    },
    [refresh]
  );

  const value: TimeClockContextType = {
    shifts,
    orgs,
    allShifts,
    focus,
    now,
    earlyStartMs: data?.earlyStartMs ?? DEFAULT_EARLY_START_MS,
    loading,
    pendingEndId,
    refresh,
    start: (shift) =>
      withPosition((position) =>
        startShift({ orgId: shift.orgId, weekStart: shift.weekStart, shiftId: shift.id, position })
      ),
    pause: (shift) => plain(() => pauseShift(shift.entryId)),
    resume: (shift) => withPosition((position) => resumeShift(shift.entryId, position)),
    end: async (shift) => {
      // No location: ending is never blocked, and where it happened isn't
      // recorded.
      try {
        if (!uid) return { ok: false, message: GENERIC };
        const outcome = await endShift(uid, shift.entryId, Date.now() + skew.current);
        if (outcome === 'queued') setPendingEndId(shift.entryId);
        await refresh();
        return { ok: true, queued: outcome === 'queued' };
      } catch (error) {
        return { ok: false, message: timeclockErrorMessage(error, GENERIC) };
      }
    },
    saveNote: (entryId, note) => plain(() => setShiftNote(entryId, note)),
  };

  return <TimeClockContext.Provider value={value}>{children}</TimeClockContext.Provider>;
}

export function useTimeClock() {
  const context = useContext(TimeClockContext);
  if (context === undefined) {
    throw new Error('useTimeClock must be used within a TimeClockProvider');
  }
  return context;
}
