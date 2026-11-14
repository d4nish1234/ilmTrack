import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, Text, TextInput } from 'react-native-paper';
import { Button } from '../common';
import { TimeField } from './TimeField';
import type { TimesheetRow } from '../../utils/timesheet';
import { errorMessage, formatDuration, formatTime } from '../../utils/timekeeping';
import { colors, fontWeight, spacing, typography } from '../../constants/theme';

interface TimeWorkedPanelProps {
  row: TimesheetRow;
  /** Save a correction: worked from/to ('HH:mm', org time) and why. */
  onCorrect: (start: string, end: string, reason: string) => Promise<void>;
}

const STATUS: Record<TimesheetRow['status'], string> = {
  upcoming: 'Not started yet',
  late: 'Not started yet',
  'not-started': 'Not started',
  running: 'On shift now',
  paused: 'On a break now',
  worked: 'Worked',
};

/**
 * What a teacher actually worked on one shift, for org admins, with a way to
 * correct it (or add time for a shift they never started). The server keeps
 * the teacher's own record and requires a reason (correctTimeEntry).
 */
/**
 * Where the editor starts: what was worked, kept within the shift as it is
 * now (it may have been shortened since), so saving unchanged is accepted.
 * 'HH:mm' strings compare in time order.
 */
function initialTimes(row: TimesheetRow): [string, string] {
  const start = row.workedFrom && row.workedFrom > row.start ? row.workedFrom : row.start;
  const end = row.workedTo && row.workedTo < row.end ? row.workedTo : row.end;
  return start < end ? [start, end] : [row.start, row.end];
}

export function TimeWorkedPanel({ row, onCorrect }: TimeWorkedPanelProps) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(() => initialTimes(row)[0]);
  const [end, setEnd] = useState(() => initialTimes(row)[1]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entry = row.entry;
  const open = row.status === 'running' || row.status === 'paused';
  const canCorrect = row.status === 'worked' || row.status === 'not-started';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onCorrect(start, end, reason);
      setEditing(false);
      setReason('');
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Divider style={styles.divider} />
      <Text variant={typography.h4} style={styles.title}>
        Time worked
      </Text>

      <View style={styles.row}>
        <Text variant={typography.bodyLarge}>
          {STATUS[row.status]}
          {row.workedFrom && row.workedTo && row.status === 'worked'
            ? ` ${formatTime(row.workedFrom)}–${formatTime(row.workedTo)}`
            : ''}
        </Text>
        {(row.status === 'worked' || open) && (
          <Text variant={typography.bodyLarge} style={styles.minutes}>
            {formatDuration(row.workedMinutes)}
          </Text>
        )}
      </View>

      {entry?.correction && (
        <Text variant={typography.body} style={styles.muted}>
          Edited by admin: {entry.correction.reason}
          {entry.original
            ? ` · teacher recorded ${formatDuration(entry.original.workedMinutes)}`
            : ' · added by admin'}
        </Text>
      )}
      {!!entry?.note && (
        <Text variant={typography.body} style={styles.muted}>
          Teacher&apos;s note: {entry.note}
        </Text>
      )}
      {open && (
        <Text variant={typography.body} style={styles.muted}>
          It can be corrected once the shift has ended.
        </Text>
      )}
      {row.status === 'late' && (
        <Text variant={typography.body} style={styles.muted}>
          Time can be added once the shift has ended.
        </Text>
      )}

      {canCorrect && !editing && (
        <Button
          mode="outlined"
          icon="pencil"
          onPress={() => {
            // Start from what's on record now, not when the sheet opened.
            const [s, e] = initialTimes(row);
            setStart(s);
            setEnd(e);
            setError(null);
            setEditing(true);
          }}
          style={styles.button}
        >
          {entry ? 'Correct time' : 'Add time'}
        </Button>
      )}

      {editing && (
        <View style={styles.editor}>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>Worked from</Text>
            <TimeField value={start} onChange={setStart} />
          </View>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>to</Text>
            <TimeField value={end} onChange={setEnd} />
          </View>
          <TextInput
            label="Reason (required)"
            placeholder="e.g. Forgot to end the shift"
            value={reason}
            onChangeText={setReason}
            mode="outlined"
            maxLength={200}
            style={styles.input}
          />
          <Text variant={typography.caption} style={styles.muted}>
            Must be within the shift. To pay for longer, extend the shift above first.
          </Text>
          {error && (
            <Text variant={typography.body} style={styles.error}>
              {error}
            </Text>
          )}
          <Button onPress={save} loading={saving} disabled={saving || !reason.trim() || start >= end}>
            Save correction
          </Button>
          <Button mode="text" onPress={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    marginVertical: spacing.lg,
  },
  title: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  minutes: {
    fontWeight: fontWeight.bold,
  },
  muted: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  button: {
    marginTop: spacing.md,
  },
  editor: {
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.sm,
  },
});
