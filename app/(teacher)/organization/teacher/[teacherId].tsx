import React, { useEffect, useState } from 'react';
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
  subscribeToTeacherWeek,
  subscribeToTimekeeping,
} from '../../../../src/services/timekeeping.service';
import { AppSnackbar, Button, LoadingSpinner } from '../../../../src/components/common';
import type { Shift, TimekeepingLocation } from '../../../../src/types';
import {
  formatTime,
  shiftWeek,
  weekDates,
  currentWeekStart,
  weekSummary,
} from '../../../../src/utils/timekeeping';

/**
 * One teacher's week: a row per day, tap + to add a shift, tap a shift to
 * change it, and one button to carry the week over to the next.
 */
export default function TeacherWeekScreen() {
  const { teacherId, name } = useLocalSearchParams<{ teacherId: string; name?: string }>();
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

  if (!orgId || !teacherId || !user) return null;
  if (!weekStart) return <LoadingSpinner />;

  const locationName = (shift: Shift) =>
    locations.find((l) => l.id === shift.locationId)?.name ?? 'Location removed';

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
          const dayShifts = shifts.filter((s) => s.date === date);
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
                  {dayShifts.length === 0 && (
                    <Text variant="bodyMedium" style={styles.none}>
                      —
                    </Text>
                  )}
                  {dayShifts.map((s) => (
                    <Pressable
                      key={s.id}
                      style={styles.shift}
                      onPress={() => openShift({ shiftId: s.id })}
                      accessibilityRole="button"
                    >
                      <Text variant="bodyMedium" style={styles.shiftTime}>
                        {formatTime(s.start)}–{formatTime(s.end)}
                      </Text>
                      {locations.length > 1 && (
                        <Text variant="bodySmall" style={styles.muted}>
                          {locationName(s)}
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
          {weekSummary(shifts)}
        </Text>
        <Button
          mode="outlined"
          icon="content-copy"
          onPress={() => copyToNextWeek()}
          loading={copying}
          disabled={copying || shifts.length === 0}
        >
          Copy to next week
        </Button>
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
