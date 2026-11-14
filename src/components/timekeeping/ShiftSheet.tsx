import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Chip, IconButton, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { Button, Tappable, useUnsavedChanges } from '../common';
import { TimeField } from './TimeField';
import type { Shift, TimekeepingLocation } from '../../types';
import type { TimesheetRow } from '../../utils/timesheet';
import { errorMessage, formatDuration, formatTime, shiftMinutes, shiftProblem } from '../../utils/timekeeping';
import {
  canEditWorked,
  hasHappened,
  initialWorked,
  sameWorked,
  scheduleChanged,
  shiftStatus,
  workedOutsidePlan,
  workedProblem,
  type StatusTone,
  type WorkedTimes,
} from '../../utils/shiftSheet';
import { colors, fontWeight, radius, spacing, typography } from '../../constants/theme';

interface ShiftSheetProps {
  title: string;
  /**
   * The shift as it opened (a new one prefilled), or null when it was removed
   * from the schedule after it was worked: then only Worked shows.
   */
  shift: Shift | null;
  /** The shift as stored now, live; null for a new one. What "changed" is measured against. */
  stored: Shift | null;
  isNew: boolean;
  /** The teacher's other shifts that week, to catch overlaps before saving. */
  otherShifts: Shift[];
  locations: TimekeepingLocation[];
  /** What was worked against this shift; null for a new one. */
  row: TimesheetRow | null;
  /** A line under the date, e.g. that the shift came from a schedule template. */
  notice?: string;
  onSaveShift: (shift: Shift) => Promise<void>;
  onDeleteShift: (shift: Shift) => Promise<void>;
  /** Save worked hours: from/to ('HH:mm', org time) and why. */
  onCorrect: (start: string, end: string, reason: string) => Promise<void>;
}

const TONE: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  primary: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.surface, fg: colors.textSecondary },
};

/**
 * One shift, as a sheet: what was planned (Scheduled) and what happened
 * (Worked), with a status at the top. A shift that has started or is over
 * leads with Worked and folds Scheduled into one line (Change › opens it);
 * an upcoming one shows only Scheduled.
 *
 * One Save, pinned and shown only once something has changed (the edit-screen
 * pattern). It saves the plan first, then the hours, so hours can run past
 * the old end in the same save (the server requires them within the shift).
 * If the hours then fail, the saved plan no longer counts as a change, so
 * Save retries just the hours. Back asks before discarding changes.
 */
export function ShiftSheet({
  title,
  shift,
  stored,
  isNew,
  otherShifts,
  locations,
  row,
  notice,
  onSaveShift,
  onDeleteShift,
  onCorrect,
}: ShiftSheetProps) {
  const happened = hasHappened(row);
  const editable = canEditWorked(row);
  const removed = !shift;

  // The plan, measured against the live stored shift (a new one, against
  // how it opened), so once saved it stops counting as a change.
  const [plan, setPlan] = useState<Shift | null>(shift);
  const [opened] = useState<Shift | null>(shift);
  const baseline = stored ?? opened;
  const [planOpen, setPlanOpen] = useState(!happened);

  // Worked hours. A shift never started has none until Add hours worked.
  const [worked, setWorked] = useState<WorkedTimes | null>(() =>
    row && row.status === 'worked' ? initialWorked(row) : null
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const planChanged = isNew || (!!plan && !!baseline && scheduleChanged(plan, baseline));
  const workedChanged =
    !!row && !!worked && (row.status === 'not-started' || !sameWorked(worked, initialWorked(row)));
  const changed = !done && (planChanged || workedChanged);

  const locationMissing = !!plan && !locations.some((l) => l.id === plan.locationId);
  // Bounds for the hours: the shift as this save will leave it, or, for a
  // removed shift, the times the entry recorded.
  const bounds = plan ? { start: plan.start, end: plan.end } : row ? { start: row.start, end: row.end } : null;
  const problem =
    (planChanged && plan ? shiftProblem(plan, otherShifts) : null) ??
    (planChanged && locationMissing ? 'Choose a location.' : null) ??
    (workedChanged && worked && bounds ? workedProblem(worked, bounds, reason) : null);

  // Shortening the plan below hours already worked: allowed, but said.
  const recorded = row?.entry && row.workedFrom && row.workedTo ? { start: row.workedFrom, end: row.workedTo } : null;
  const warning =
    planChanged && plan && !isNew ? workedOutsidePlan({ start: plan.start, end: plan.end }, worked ?? recorded) : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (plan && planChanged) await onSaveShift(plan);
      if (worked && workedChanged) await onCorrect(worked.start, worked.end, reason.trim());
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  // Leaving with changes asks: Keep editing, Discard, or Save.
  useUnsavedChanges(changed, changed && !problem && !saving ? save : undefined);
  // Back once saved or deleted, after the render that turned the guard off.
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const remove = () => {
    if (!plan) return;
    Alert.alert(
      'Delete this shift?',
      row?.entry ? 'The hours already worked are kept.' : 'It comes off this day of the schedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onDeleteShift(plan);
              setDone(true);
            } catch (err) {
              setError(errorMessage(err, "Couldn't delete. Check your connection and try again."));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const status = shiftStatus(row);
  const date = plan?.date ?? row?.date ?? '';

  const scheduledSection = plan && (
    <View style={styles.section}>
      <Text variant={typography.labelMedium} style={styles.sectionTitle}>
        SCHEDULED
      </Text>
      {!planOpen ? (
        <Tappable style={styles.summary} onPress={() => setPlanOpen(true)} accessibilityLabel="Change the scheduled time">
          <Text variant={typography.bodyLarge} style={styles.summaryText}>
            {formatTime(plan.start)} – {formatTime(plan.end)}
            {locations.length > 1 || locationMissing ? ` · ${locations.find((l) => l.id === plan.locationId)?.name ?? 'Location removed'}` : ''}
            {` · ${formatDuration(shiftMinutes(plan))}`}
          </Text>
          <Text variant={typography.label} style={styles.change}>
            Change ›
          </Text>
        </Tappable>
      ) : (
        <>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>Start</Text>
            <TimeField value={plan.start} onChange={(start) => setPlan({ ...plan, start })} />
          </View>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>End</Text>
            <TimeField value={plan.end} onChange={(end) => setPlan({ ...plan, end })} />
          </View>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge} style={styles.muted}>
              Total
            </Text>
            <Text variant={typography.bodyLarge} style={styles.muted}>
              {formatDuration(Math.max(0, shiftMinutes(plan)))}
            </Text>
          </View>
          {(locations.length > 1 || locationMissing) && (
            <View style={styles.chips}>
              {locations.map((l) => (
                <Chip
                  key={l.id}
                  selected={l.id === plan.locationId}
                  showSelectedOverlay
                  onPress={() => setPlan({ ...plan, locationId: l.id })}
                  style={styles.chip}
                >
                  {l.name}
                </Chip>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );

  const workedSection = row && happened && (
    <View style={styles.section}>
      <Text variant={typography.labelMedium} style={styles.sectionTitle}>
        WORKED
      </Text>

      {!editable && (
        <>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>
              {row.workedFrom ? `Since ${formatTime(row.workedFrom)}` : 'Started'}
            </Text>
            <Text variant={typography.bodyLarge} style={styles.total}>
              {formatDuration(row.workedMinutes)}
            </Text>
          </View>
          <Text variant={typography.caption} style={styles.muted}>
            The hours can be changed once the shift has ended.
          </Text>
        </>
      )}

      {editable && !worked && (
        <>
          <Text variant={typography.bodyLarge} style={styles.muted}>
            Not started.
          </Text>
          <Button
            mode="outlined"
            icon="plus"
            onPress={() => setWorked(initialWorked(row))}
            style={styles.addHours}
          >
            Add hours worked
          </Button>
        </>
      )}

      {editable && worked && (
        <>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>From</Text>
            <TimeField value={worked.start} onChange={(start) => setWorked({ ...worked, start })} />
          </View>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge}>To</Text>
            <TimeField value={worked.end} onChange={(end) => setWorked({ ...worked, end })} />
          </View>
          <View style={styles.row}>
            <Text variant={typography.bodyLarge} style={styles.muted}>
              Total
            </Text>
            <Text variant={typography.bodyLarge} style={styles.total}>
              {formatDuration(worked.start < worked.end ? shiftMinutes(worked) : 0)}
            </Text>
          </View>
          {workedChanged && (
            <TextInput
              label="Reason for the change (required)"
              placeholder={row.entry ? 'e.g. Forgot to end the shift' : 'e.g. Phone died, worked the full shift'}
              value={reason}
              onChangeText={setReason}
              mode="outlined"
              maxLength={200}
              style={styles.input}
            />
          )}
        </>
      )}

      {row.entry?.correction && (
        <Text variant={typography.caption} style={styles.muted}>
          Edited by admin: {row.entry.correction.reason}
          {row.entry.original
            ? ` · teacher recorded ${formatDuration(row.entry.original.workedMinutes)}`
            : ' · added by admin'}
        </Text>
      )}
      {!!row.entry?.note && (
        <Text variant={typography.caption} style={styles.muted}>
          Teacher&apos;s note: {row.entry.note}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title,
          // Closing goes back from JavaScript, so unsaved changes are asked about.
          headerLeft: () => (
            <IconButton
              icon="close"
              iconColor={colors.onPrimary}
              size={24}
              style={styles.close}
              onPress={() => router.back()}
              accessibilityLabel="Close"
            />
          ),
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.lg}
      >
        <View style={styles.header}>
          <Text variant={typography.h3} style={styles.title}>
            {date ? format(parseISO(date), 'EEEE, MMM d') : ''}
          </Text>
          {status && (
            <View style={[styles.pill, { backgroundColor: TONE[status.tone].bg }]}>
              <Text variant={typography.labelMedium} style={{ color: TONE[status.tone].fg }}>
                {status.label}
              </Text>
            </View>
          )}
        </View>
        {!!notice && (
          <Text variant={typography.body} style={styles.notice}>
            {notice}
          </Text>
        )}
        {removed && (
          <Text variant={typography.body} style={styles.notice}>
            This shift was removed from the schedule after it was worked. Its hours are kept.
          </Text>
        )}

        {happened ? (
          <>
            {workedSection}
            {scheduledSection}
          </>
        ) : (
          <>
            {scheduledSection}
            {row?.status === 'late' && (
              <Text variant={typography.caption} style={styles.muted}>
                Not started yet. Hours can be added once the shift has ended.
              </Text>
            )}
          </>
        )}

        {!isNew && plan && (
          <Button mode="outlined" textColor={colors.danger} onPress={remove} disabled={saving} style={styles.delete}>
            Delete shift
          </Button>
        )}
      </KeyboardAwareScrollView>

      {changed && (
        <View style={styles.footer}>
          {(problem || error) && (
            <Text variant={typography.body} style={styles.footerError}>
              {problem ?? error}
            </Text>
          )}
          {!problem && !error && warning && (
            <Text variant={typography.body} style={styles.footerWarning}>
              {warning}
            </Text>
          )}
          <Button onPress={save} loading={saving} disabled={saving || !!problem}>
            {isNew ? 'Add shift' : 'Save changes'}
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  close: {
    margin: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: {
    fontWeight: fontWeight.semibold,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
  },
  notice: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: spacing.sm,
  },
  summaryText: {
    flex: 1,
  },
  change: {
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  muted: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  total: {
    fontWeight: fontWeight.bold,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  chip: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  addHours: {
    alignSelf: 'flex-start',
  },
  input: {
    backgroundColor: colors.card,
    marginTop: spacing.sm,
  },
  delete: {
    marginTop: 32,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerError: {
    color: colors.danger,
    paddingTop: 10,
  },
  footerWarning: {
    color: colors.warning,
    paddingTop: 10,
  },
});
