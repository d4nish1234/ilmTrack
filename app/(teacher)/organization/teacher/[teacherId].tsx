import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Divider, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../../src/contexts/OrganizationContext';
import {
  copyWeek,
  countShifts,
  deleteShift,
  newId,
  saveShift,
  subscribeToTeacherWeek,
  subscribeToTimekeeping,
} from '../../../../src/services/timekeeping.service';
import { AppSnackbar, Button } from '../../../../src/components/common';
import { ShiftEditor } from '../../../../src/components/timekeeping/ShiftEditor';
import type { Shift, TimekeepingLocation } from '../../../../src/types';
import {
  formatTime,
  shiftWeek,
  weekDates,
  weekStartOf,
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
  const thisWeek = weekStartOf(new Date());

  const [weekStart, setWeekStart] = useState(thisWeek);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [locations, setLocations] = useState<TimekeepingLocation[]>([]);
  const [editing, setEditing] = useState<{ shift: Shift; isNew: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => setLocations(s?.locations ?? []),
      (err) => console.error('Error loading locations:', err)
    );
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !teacherId) return;
    // Clear the previous week straight away, so the total, the copy button
    // and its confirmation never describe a week that is no longer shown.
    setShifts([]);
    return subscribeToTeacherWeek(orgId, teacherId, weekStart, setShifts, (err) => {
      console.error('Error loading week:', err);
      setMessage({ text: "Couldn't load this week.", type: 'error' });
    });
  }, [orgId, teacherId, weekStart]);

  if (!orgId || !teacherId || !user) return null;

  const locationName = (shift: Shift) =>
    locations.find((l) => l.id === shift.locationId)?.name ?? shift.locationName;

  /** A new shift on this date, prefilled from the last shift this week so repeats are quick. */
  const startNewShift = (date: string) => {
    const last = shifts[shifts.length - 1];
    const location =
      locations.find((l) => l.id === last?.locationId) ?? locations[0];
    setEditing({
      isNew: true,
      shift: {
        id: newId(),
        date,
        start: last?.start ?? '16:00',
        end: last?.end ?? '17:00',
        locationId: location?.id ?? '',
        locationName: location?.name ?? '',
      },
    });
  };

  const nextWeek = shiftWeek(weekStart, 1);
  const weekLabel = (start: string) => `week of ${format(parseISO(start), 'MMM d')}`;

  const doCopy = async () => {
    setCopying(true);
    try {
      const count = await copyWeek(orgId, teacherId, weekStart, nextWeek, user.uid);
      // Move to the copy, so the same button carries it on another week.
      setWeekStart(nextWeek);
      setMessage({
        text: `Copied ${count} shift${count === 1 ? '' : 's'} to the ${weekLabel(nextWeek)}`,
        type: 'success',
      });
    } catch (err) {
      console.error('Error copying week:', err);
      setMessage({ text: "Couldn't copy this week. Please try again.", type: 'error' });
    } finally {
      setCopying(false);
    }
  };

  const copyToNextWeek = async () => {
    try {
      const existing = await countShifts(orgId, teacherId, nextWeek);
      if (existing === 0) return doCopy();
      Alert.alert(
        'Replace next week?',
        `The ${weekLabel(nextWeek)} already has ${existing} shift${existing === 1 ? '' : 's'}. ` +
          `They will be replaced with the ${shifts.length} from the ${weekLabel(weekStart)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: doCopy },
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
                      onPress={() => setEditing({ shift: s, isNew: false })}
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
                  onPress={() => startNewShift(date)}
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
          onPress={copyToNextWeek}
          loading={copying}
          disabled={copying || shifts.length === 0}
        >
          Copy to next week
        </Button>
      </View>

      <ShiftEditor
        shift={editing?.shift ?? null}
        isNew={editing?.isNew ?? false}
        otherShifts={shifts}
        locations={locations}
        onSave={(s) => saveShift(orgId, teacherId, weekStart, s, user.uid)}
        onDelete={(s) => deleteShift(orgId, teacherId, weekStart, s.id, user.uid)}
        onDismiss={() => setEditing(null)}
      />

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
