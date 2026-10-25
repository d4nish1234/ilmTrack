import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Card, Divider, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { format, parseISO } from 'date-fns';
import { Button, LoadingSpinner } from '../common';
import { useTimeClock, type ActionResult } from '../../contexts/TimeClockContext';
import {
  NEEDS_SETTINGS,
  POSITION_PROBLEM_MESSAGES,
  hasAskedForLocation,
  type PositionProblem,
} from '../../services/shiftLocation.service';
import { countingFrom, formatClock, formatWorked, workedMs } from '../../utils/timeclock';
import { formatTime } from '../../utils/timekeeping';
import type { ShiftView } from '../../types';
import { useAppTheme } from '../../constants/theme';

interface TimeClockSheetProps {
  onDone: () => void;
}

const shiftTimes = (s: ShiftView) => `${formatTime(s.start)}–${formatTime(s.end)}`;
const clockTime = (ms: number) => format(ms, 'h:mm a');

/**
 * Everything about the teacher's time: start, break, resume, end, the end
 * summary with a note, and this week's shifts. Opened from the Classes bar.
 */
export function TimeClockSheet({ onDone }: TimeClockSheetProps) {
  const clock = useTimeClock();
  const { focus, now, shifts, loading } = clock;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; problem?: PositionProblem } | null>(null);
  // The shift just ended here, summarised until Done even if another shift
  // becomes startable.
  const [justEndedId, setJustEndedId] = useState<string | null>(null);

  useEffect(() => {
    clock.refresh();
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showOrgs = new Set(shifts.map((s) => s.orgId)).size > 1;

  const run = async (action: () => Promise<ActionResult>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        after?.();
      } else {
        setError({
          message: result.problem ? POSITION_PROBLEM_MESSAGES[result.problem] : result.message,
          problem: result.problem,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const start = async (shift: ShiftView) => {
    // Explain before the system prompt, the first time only.
    if (!(await hasAskedForLocation())) {
      Alert.alert(
        'Location check',
        `ilmTrack checks that you're at ${shift.locationName || 'your school'} when you start a shift or come back from a break. It doesn't track you in between.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Continue', onPress: () => run(() => clock.start(shift)) },
        ]
      );
      return;
    }
    run(() => clock.start(shift));
  };

  const end = (shift: ShiftView) => {
    const worked = formatWorked(workedMs(shift.entry!, shift.startAt, shift.endAt, now));
    Alert.alert('End shift?', `You've worked ${worked}. You can't restart it once it's ended.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End shift',
        style: 'destructive',
        onPress: () => run(() => clock.end(shift), () => setJustEndedId(shift.entryId)),
      },
    ]);
  };

  if (loading && shifts.length === 0) return <LoadingSpinner />;

  const justEnded = justEndedId ? shifts.find((s) => s.entryId === justEndedId) : undefined;
  const summaryShift =
    justEnded?.entry?.status === 'done'
      ? justEnded
      : focus.kind === 'done-today' && focus.shift.entry?.status === 'done'
        ? focus.shift
        : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={16}>
        {summaryShift ? (
          <ShiftSummary shift={summaryShift} now={now} showOrg={showOrgs} onDone={onDone} />
        ) : (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <FocusCard
                busy={busy}
                pendingEnd={clock.pendingEndId}
                showOrg={showOrgs}
                onStart={start}
                onPause={(s) => run(() => clock.pause(s))}
                onResume={(s) => run(() => clock.resume(s))}
                onEnd={end}
              />
              {error && (
                <View style={styles.errorBox}>
                  <Text variant="bodyMedium" style={styles.error}>
                    {error.message}
                  </Text>
                  {error.problem && NEEDS_SETTINGS.includes(error.problem) && (
                    <Button mode="text" onPress={() => Linking.openSettings()}>
                      Open Settings
                    </Button>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {shifts.length > 0 && (
          <Text variant="titleMedium" style={styles.weekTitle}>
            This week
          </Text>
        )}
        {shifts.map((s, i) => (
          <View key={s.entryId}>
            {i > 0 && <Divider />}
            <WeekRow shift={s} now={now} showOrg={showOrgs} />
          </View>
        ))}

        {/* Swipe-to-dismiss is off in this stack (gestureEnabled: false). */}
        <Button mode="outlined" onPress={onDone} style={styles.closeButton}>
          Close
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function FocusCard({
  busy,
  pendingEnd,
  showOrg,
  onStart,
  onPause,
  onResume,
  onEnd,
}: {
  busy: boolean;
  pendingEnd: string | null;
  showOrg: boolean;
  onStart: (s: ShiftView) => void;
  onPause: (s: ShiftView) => void;
  onResume: (s: ShiftView) => void;
  onEnd: (s: ShiftView) => void;
}) {
  const { focus, now, earlyStartMs } = useTimeClock();
  const tone = useAppTheme().colors.timeClock;
  const place = (s: ShiftView) => [s.locationName, showOrg ? s.orgName : ''].filter(Boolean).join(' · ');

  switch (focus.kind) {
    case 'running':
    case 'paused': {
      const s = focus.shift;
      const running = focus.kind === 'running';
      const counting = countingFrom(s.entry!, s.startAt);
      // Started early: say when the time will start, and drop the line once
      // it has.
      const startsLater = now < s.startAt;
      return (
        <>
          <Text variant="labelLarge" style={[styles.status, { color: (running ? tone.running : tone.paused).fg }]}>
            {running ? 'ON SHIFT' : 'ON BREAK'}
          </Text>
          <Text variant="displaySmall" style={styles.timer}>
            {formatClock(workedMs(s.entry!, s.startAt, s.endAt, now))}
          </Text>
          {startsLater ? (
            <Text variant="bodyMedium" style={styles.muted}>
              Your time will start automatically at {formatTime(s.start)}.
            </Text>
          ) : (
            <Text variant="bodyMedium" style={styles.muted}>
              {counting ? `Started ${clockTime(counting)} · ` : ''}ends automatically at {formatTime(s.end)}
            </Text>
          )}
          <Text variant="bodyMedium" style={styles.muted}>
            {place(s)}
          </Text>
          {pendingEnd === s.entryId ? (
            <Text variant="bodyMedium" style={[styles.pending, { color: tone.paused.fg }]}>
              Ended offline. It will be saved, with the time you tapped End, once you’re back online.
            </Text>
          ) : (
            <View style={styles.buttons}>
              {running ? (
                <Button mode="outlined" onPress={() => onPause(s)} loading={busy} disabled={busy} style={styles.half}>
                  Break
                </Button>
              ) : (
                <Button onPress={() => onResume(s)} loading={busy} disabled={busy} style={styles.half}>
                  Resume
                </Button>
              )}
              <Button
                mode="outlined"
                textColor="#d32f2f"
                onPress={() => onEnd(s)}
                disabled={busy}
                style={styles.half}
              >
                End
              </Button>
            </View>
          )}
        </>
      );
    }
    case 'ready': {
      const s = focus.shift;
      return (
        <>
          <Text variant="labelLarge" style={[styles.status, { color: tone.ready.fg }]}>
            TODAY
          </Text>
          <Text variant="headlineSmall" style={styles.heading}>
            {shiftTimes(s)}
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {place(s)}
          </Text>
          <Button onPress={() => onStart(s)} loading={busy} disabled={busy} icon="play" style={styles.primary}>
            Start shift
          </Button>
        </>
      );
    }
    case 'later-today':
    case 'upcoming': {
      const s = focus.shift;
      const opens = s.startAt - earlyStartMs;
      return (
        <>
          <Text variant="labelLarge" style={[styles.status, { color: tone.idle.fg }]}>
            {focus.kind === 'later-today' ? 'LATER TODAY' : `NEXT · ${format(parseISO(s.date), 'EEEE').toUpperCase()}`}
          </Text>
          <Text variant="headlineSmall" style={styles.heading}>
            {shiftTimes(s)}
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            {place(s)}
          </Text>
          <Text variant="bodyMedium" style={styles.hint}>
            You can start from {clockTime(opens)}.
          </Text>
        </>
      );
    }
    case 'week-over':
      return (
        <>
          <Text variant="labelLarge" style={[styles.status, { color: tone.idle.fg }]}>
            THIS WEEK
          </Text>
          <Text variant="headlineSmall" style={styles.heading}>
            {formatWorked(focus.workedWeekMs)} worked
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            No more shifts this week.
          </Text>
        </>
      );
    default:
      return (
        <>
          <Text variant="labelLarge" style={[styles.status, { color: tone.idle.fg }]}>
            THIS WEEK
          </Text>
          <Text variant="headlineSmall" style={styles.heading}>
            No shifts yet
          </Text>
          <Text variant="bodyMedium" style={styles.hint}>
            When an admin schedules you, your shifts appear here and you can start them from this
            sheet. Start is available {earlyStartMs / 60_000} minutes before each shift.
          </Text>
        </>
      );
  }
}

function ShiftSummary({ shift, now, showOrg, onDone }: { shift: ShiftView; now: number; showOrg: boolean; onDone: () => void }) {
  const { saveNote } = useTimeClock();
  const tone = useAppTheme().colors.timeClock;
  const entry = shift.entry!;
  const [note, setNote] = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // When time started counting, not when Start was tapped: an early start
  // shows the scheduled start, matching the hours.
  const first = countingFrom(entry, shift.startAt);
  const lastEnd = entry.segments[entry.segments.length - 1]?.end?.toMillis();
  const worked = workedMs(entry, shift.startAt, shift.endAt, now);
  const changed = note.trim() !== (entry.note ?? '');

  const done = async () => {
    if (changed) {
      setSaving(true);
      const result = await saveNote(entry.id, note);
      setSaving(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
    }
    onDone();
  };

  return (
    <Card style={styles.card} mode="contained">
      <Card.Content>
        <Text variant="labelLarge" style={[styles.status, { color: tone.idle.fg }]}>
          {entry.correction
            ? 'SHIFT EDITED BY ADMIN'
            : entry.endedBy === 'schedule'
              ? 'SHIFT ENDED AUTOMATICALLY'
              : 'SHIFT ENDED'}
        </Text>
        <Text variant="titleMedium" style={styles.heading}>
          {format(parseISO(shift.date), 'EEEE, MMM d')}
        </Text>
        <Text variant="bodyMedium" style={styles.muted}>
          {[shift.locationName, showOrg ? shift.orgName : ''].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.summaryRow}>
          <Text variant="titleMedium">
            {first ? clockTime(first) : '—'} → {lastEnd ? clockTime(lastEnd) : '—'}
          </Text>
          <Text variant="titleMedium" style={styles.total}>
            {formatWorked(worked)}
          </Text>
        </View>

        {entry.correction && (
          <Text variant="bodyMedium" style={[styles.edited, { color: tone.paused.fg }]}>
            Your admin changed this shift’s time: {entry.correction.reason}
          </Text>
        )}

        <TextInput
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          mode="outlined"
          multiline
          maxLength={500}
          style={styles.note}
        />
        {message && (
          <Text variant="bodyMedium" style={styles.error}>
            {message}
          </Text>
        )}
        <Button onPress={done} loading={saving} disabled={saving} style={styles.primary}>
          Done
        </Button>
      </Card.Content>
    </Card>
  );
}

function WeekRow({ shift, now, showOrg }: { shift: ShiftView; now: number; showOrg: boolean }) {
  const tone = useAppTheme().colors.timeClock;
  const status = shift.entry?.status;
  const right =
    status === 'running'
      ? 'On shift'
      : status === 'paused'
        ? 'On break'
        : status === 'done'
          ? formatWorked(workedMs(shift.entry!, shift.startAt, shift.endAt, now))
          : now >= shift.endAt
            ? 'Not started'
            : '';
  return (
    <View style={styles.row}>
      <View style={styles.rowDay}>
        <Text variant="titleSmall">{format(parseISO(shift.date), 'EEE')}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {format(parseISO(shift.date), 'd')}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <Text variant="bodyMedium">{shiftTimes(shift)}</Text>
        <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
          {[shift.locationName, showOrg ? shift.orgName : ''].filter(Boolean).join(' · ')}
        </Text>
        {shift.entry?.correction && (
          <Text variant="bodySmall" style={{ color: tone.paused.fg }} numberOfLines={2}>
            Edited by admin: {shift.entry.correction.reason}
          </Text>
        )}
      </View>
      <Text
        variant="bodyMedium"
        style={[
          styles.rowRight,
          status === 'running' && { color: tone.running.fg },
          status === 'paused' && { color: tone.paused.fg },
          right === 'Not started' && styles.muted,
        ]}
      >
        {right}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#f8f9fa',
  },
  status: {
    fontWeight: '700',
  },
  timer: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginVertical: 4,
  },
  heading: {
    fontWeight: '600',
    marginTop: 4,
  },
  muted: {
    color: '#666',
  },
  hint: {
    color: '#666',
    marginTop: 12,
  },
  pending: {
    marginTop: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  half: {
    flex: 1,
  },
  primary: {
    marginTop: 16,
  },
  errorBox: {
    marginTop: 12,
  },
  error: {
    color: '#d32f2f',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  total: {
    fontWeight: '700',
  },
  note: {
    backgroundColor: '#fff',
  },
  edited: {
    marginBottom: 12,
  },
  closeButton: {
    marginTop: 24,
  },
  weekTitle: {
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowDay: {
    width: 44,
  },
  rowMain: {
    flex: 1,
  },
  rowRight: {
    marginLeft: 8,
    fontWeight: '600',
  },
});
