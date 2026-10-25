import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Divider, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../../src/contexts/OrganizationContext';
import {
  WeekChangedError,
  copyWeek,
  inspectWeek,
  type WeekSnapshot,
  subscribeToOrgWeekEntries,
  subscribeToTeacherWeek,
  subscribeToTimekeeping,
} from '../../../../src/services/timekeeping.service';
import { shareCsv } from '../../../../src/services/export.service';
import { AppSnackbar, Button, LoadingSpinner } from '../../../../src/components/common';
import type { Shift, TimeEntry, TimekeepingLocation } from '../../../../src/types';
import {
  formatTime,
  shiftWeek,
  weekDates,
  currentWeekStart,
  weekSummary,
  formatDuration,
} from '../../../../src/utils/timekeeping';
import { csvFileName, timesheetCsv, timesheetRows, totals, type TimesheetRow } from '../../../../src/utils/timesheet';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The small line under a shift: what was worked against it. */
function workedLabel(row: TimesheetRow): string {
  switch (row.status) {
    case 'running':
      return `● On shift · ${formatDuration(row.workedMinutes)}`;
    case 'paused':
      return `On break · ${formatDuration(row.workedMinutes)}`;
    case 'worked':
      return `Worked ${formatDuration(row.workedMinutes)}${row.entry?.correction ? ' · edited' : ''}`;
    case 'not-started':
      return 'Not started';
    case 'late':
      return 'Not started yet';
    default:
      return '';
  }
}

/**
 * One teacher's week: a row per day, tap + to add a shift, tap a shift to
 * change it or its hours, one button to carry the week over to the next, and
 * an export. Each shift shows what was worked against it; a shift removed
 * after it was worked still shows, so its hours aren't lost.
 */
export default function TeacherWeekScreen() {
  const { teacherId, name, email } = useLocalSearchParams<{ teacherId: string; name?: string; email?: string }>();
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [locations, setLocations] = useState<TimekeepingLocation[]>([]);
  const [timezone, setTimezone] = useState<string | null>(null);
  // Null until the settings (and so the organization's timezone) have loaded,
  // so the first week shown is the organization's current week.
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const thisWeek = currentWeekStart(timezone);
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setLocations(s?.locations ?? []);
        const zone = s?.timezone ?? null;
        setTimezone(zone);
        setWeekStart((current) => current ?? currentWeekStart(zone));
      },
      (err) => {
        console.error('Error loading locations:', err);
        // Still show a week: the device's own, the explicit fallback.
        setWeekStart((current) => current ?? currentWeekStart(null));
      }
    );
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !teacherId || !weekStart) return;
    // Clear the previous week straight away, so the total, the copy button
    // and its confirmation never describe a week that is no longer shown.
    setShifts([]);
    return subscribeToTeacherWeek(orgId, teacherId, weekStart, setShifts, (err) => {
      console.error('Error loading week:', err);
      setMessage({ text: "Couldn't load this week.", type: 'error' });
    });
  }, [orgId, teacherId, weekStart]);

  useEffect(() => {
    if (!orgId || !teacherId || !weekStart) return;
    setEntries([]);
    return subscribeToOrgWeekEntries(
      orgId,
      weekStart,
      setEntries,
      (err) => console.error('Error loading hours:', err),
      teacherId
    );
  }, [orgId, teacherId, weekStart]);

  const rows = useMemo(
    () =>
      timesheetRows(
        shifts,
        entries,
        new Map(locations.map((l) => [l.id, l.name])),
        timezone ?? deviceTimezone(),
        now
      ),
    [shifts, entries, locations, timezone, now]
  );

  if (!orgId || !teacherId || !user) return null;
  if (!weekStart) return <LoadingSpinner />;

  const worked = totals(rows);

  const exportWeek = async () => {
    setExporting(true);
    try {
      const teacherName = name || 'Teacher';
      await shareCsv(
        csvFileName([teacherName, selectedOrg?.name ?? ''], weekStart),
        timesheetCsv([{ teacher: { uid: teacherId, name: teacherName, email: email ?? '' }, rows }])
      );
    } catch (err) {
      console.error('Error exporting week:', err);
      setMessage({ text: "Couldn't export this week.", type: 'error' });
    } finally {
      setExporting(false);
    }
  };


  const openShift = (params: { shiftId: string } | { date: string }) =>
    router.push({
      pathname: '/(teacher)/organization/shift',
      params: { teacherId, weekStart, ...params },
    });

  const nextWeek = shiftWeek(weekStart, 1);
  const weekLabel = (start: string) => `week of ${format(parseISO(start), 'MMM d')}`;

  /** Copy onto next week as it was when inspected; see copyWeek. */
  const doCopy = async (expected: WeekSnapshot): Promise<void> => {
    setCopying(true);
    try {
      const count = await copyWeek(orgId, teacherId, weekStart, nextWeek, expected, user.uid);
      // Move to the copy, so the same button carries it on another week.
      setWeekStart(nextWeek);
      setMessage({
        text: `Copied ${count} shift${count === 1 ? '' : 's'} to the ${weekLabel(nextWeek)}`,
        type: 'success',
      });
    } catch (err) {
      if (err instanceof WeekChangedError) {
        // Someone wrote next week after it was inspected: look again and ask
        // again, rather than replacing shifts the admin hasn't seen.
        setCopying(false);
        return copyToNextWeek(true);
      }
      console.error('Error copying week:', err);
      setMessage({ text: "Couldn't copy this week. Please try again.", type: 'error' });
    } finally {
      setCopying(false);
    }
  };

  const copyToNextWeek = async (changedMeanwhile = false): Promise<void> => {
    try {
      const target = await inspectWeek(orgId, teacherId, nextWeek);
      // Nothing there to lose, so no need to ask.
      if (target.count === 0) return doCopy(target);
      const shiftsThere = `${target.count} shift${target.count === 1 ? '' : 's'}`;
      Alert.alert(
        changedMeanwhile ? 'Next week just changed' : 'Replace next week?',
        (changedMeanwhile
          ? `Someone else just edited the ${weekLabel(nextWeek)}. It now has ${shiftsThere}. `
          : `The ${weekLabel(nextWeek)} already has ${shiftsThere}. `) +
          `They will be replaced with the ${shifts.length} from the ${weekLabel(weekStart)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => doCopy(target) },
        ]
      );
    } catch (err) {
      console.error('Error checking next week:', err);
      setMessage({ text: "Couldn't copy this week. Please try again.", type: 'error' });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: name || 'Shifts' }} />

      <View style={styles.weekBar}>
        <IconButton
          icon="chevron-left"
          onPress={() => setWeekStart(shiftWeek(weekStart, -1))}
          accessibilityLabel="Previous week"
        />
        <Pressable onPress={() => setWeekStart(thisWeek)} style={styles.weekLabel}>
          <Text variant="titleMedium">Week of {format(parseISO(weekStart), 'MMM d')}</Text>
          <Text variant="bodySmall" style={styles.muted}>
            {weekStart === thisWeek ? 'This week' : 'Tap for this week'}
          </Text>
        </Pressable>
        <IconButton
          icon="chevron-right"
          onPress={() => setWeekStart(nextWeek)}
          accessibilityLabel="Next week"
        />
      </View>
      <Divider />

      <ScrollView>
        {weekDates(weekStart).map((date) => {
          const dayRows = rows.filter((r) => r.date === date);
          return (
            <View key={date}>
              <View style={styles.day}>
                <View style={styles.dayLabel}>
                  <Text variant="titleSmall">{format(parseISO(date), 'EEE')}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {format(parseISO(date), 'd')}
                  </Text>
                </View>
                <View style={styles.dayShifts}>
                  {dayRows.length === 0 && (
                    <Text variant="bodyMedium" style={styles.none}>
                      —
                    </Text>
                  )}
                  {dayRows.map((r) => (
                    <Pressable
                      key={`${r.date}_${r.shiftId}`}
                      style={[styles.shift, r.removed && styles.removedShift]}
                      onPress={() => openShift({ shiftId: r.shiftId, date: r.date })}
                      accessibilityRole="button"
                    >
                      <Text variant="bodyMedium" style={[styles.shiftTime, r.removed && styles.removedText]}>
                        {formatTime(r.start)}–{formatTime(r.end)}
                        {r.removed ? ' · removed' : ''}
                      </Text>
                      {(locations.length > 1 || r.removed) && (
                        <Text variant="bodySmall" style={styles.muted}>
                          {r.locationName}
                        </Text>
                      )}
                      {!!workedLabel(r) && (
                        <Text variant="bodySmall" style={styles.worked}>
                          {workedLabel(r)}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
                <IconButton
                  icon="plus"
                  iconColor="#1a73e8"
                  onPress={() => openShift({ date })}
                  disabled={locations.length === 0}
                  accessibilityLabel={`Add shift on ${format(parseISO(date), 'EEEE')}`}
                />
              </View>
              <Divider />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text variant="bodyMedium" style={styles.total}>
          {weekSummary(shifts)} · worked {formatDuration(worked.workedMinutes)}
        </Text>
        <View style={styles.footerButtons}>
          <Button
            mode="outlined"
            icon="content-copy"
            onPress={() => copyToNextWeek()}
            loading={copying}
            disabled={copying || shifts.length === 0}
            style={styles.footerButton}
          >
            Copy to next week
          </Button>
          <Button
            mode="outlined"
            icon="file-delimited-outline"
            onPress={exportWeek}
            loading={exporting}
            disabled={exporting || rows.length === 0}
            style={styles.footerButton}
          >
            Export
          </Button>
        </View>
      </View>


      <AppSnackbar
        type={message?.type}
        message={message?.text ?? null}
        onDismiss={() => setMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  weekBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weekLabel: {
    alignItems: 'center',
  },
  muted: {
    color: '#666',
  },
  worked: {
    color: '#444',
    marginTop: 2,
  },
  removedShift: {
    backgroundColor: '#f1f3f4',
  },
  removedText: {
    color: '#5f6368',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  footerButton: {
    flex: 1,
  },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingLeft: 16,
  },
  dayLabel: {
    width: 48,
  },
  dayShifts: {
    flex: 1,
    paddingVertical: 8,
  },
  none: {
    color: '#bbb',
  },
  shift: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef3fd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 3,
  },
  shiftTime: {
    color: '#1a73e8',
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  total: {
    textAlign: 'center',
    marginBottom: 8,
    color: '#444',
  },
});
