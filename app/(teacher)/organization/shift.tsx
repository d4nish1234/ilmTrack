import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import {
  correctTimeEntry,
  deleteShift,
  newId,
  saveShift,
  subscribeToOrgWeekEntries,
  subscribeToTeacherWeek,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { Button, LoadingSpinner } from '../../../src/components/common';
import { ShiftForm } from '../../../src/components/timekeeping/ShiftForm';
import { TimeWorkedPanel } from '../../../src/components/timekeeping/TimeWorkedPanel';
import type { Shift, TimeEntry, TimekeepingLocation } from '../../../src/types';
import { timesheetRows } from '../../../src/utils/timesheet';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Add or edit one shift, as a sheet over the teacher's week. Pass `shiftId` to
 * edit, or `date` to add. A new shift is prefilled from the week's last shift
 * so repeats are quick.
 *
 * An existing shift also shows what was worked, with a way to correct it. A
 * shift deleted after it was worked opens with only that part, so its hours
 * can still be corrected.
 */
export default function ShiftScreen() {
  const { teacherId, weekStart, shiftId, date } = useLocalSearchParams<{
    teacherId: string;
    weekStart: string;
    shiftId?: string;
    date?: string;
  }>();
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;

  const [locations, setLocations] = useState<TimekeepingLocation[] | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  // Built once, from the first snapshots, so later updates don't reset what
  // the admin is typing.
  const [draft, setDraft] = useState<Shift | null | 'missing'>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setLocations(s?.locations ?? []);
        setTimezone(s?.timezone ?? null);
      },
      (err) => console.error('Error loading locations:', err)
    );
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !teacherId || !weekStart) return;
    return subscribeToTeacherWeek(orgId, teacherId, weekStart, setShifts, (err) =>
      console.error('Error loading week:', err)
    );
  }, [orgId, teacherId, weekStart]);

  useEffect(() => {
    if (!orgId || !weekStart || !shiftId) return;
    return subscribeToOrgWeekEntries(
      orgId,
      weekStart,
      setEntries,
      (err) => console.error('Error loading hours:', err),
      teacherId
    );
  }, [orgId, weekStart, shiftId, teacherId]);

  useEffect(() => {
    if (draft !== null || !locations || !shifts) return;
    if (shiftId) {
      // Another admin may have deleted it since the week was shown.
      setDraft(shifts.find((s) => s.id === shiftId) ?? 'missing');
      return;
    }
    const last = shifts[shifts.length - 1];
    const location = locations.find((l) => l.id === last?.locationId) ?? locations[0];
    setDraft({
      id: newId(),
      date: date ?? weekStart,
      start: last?.start ?? '16:00',
      end: last?.end ?? '17:00',
      locationId: location?.id ?? '',
    });
  }, [draft, locations, shifts, shiftId, date, weekStart]);

  // This shift's row in the timesheet: what was worked against it.
  const row = useMemo(() => {
    if (!shiftId || !shifts || !locations) return null;
    const scheduled = shifts.filter((s) => s.id === shiftId);
    const entry = entries.filter((e) => e.shiftId === shiftId && (!date || e.date === date));
    const names = new Map(locations.map((l) => [l.id, l.name]));
    return timesheetRows(scheduled, entry, names, timezone ?? deviceTimezone(), now)[0] ?? null;
  }, [shiftId, shifts, locations, entries, date, timezone, now]);

  const title = shiftId ? 'Edit Shift' : 'Add Shift';

  if (!orgId || !teacherId || !weekStart || !user || !draft || !locations || !shifts) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <LoadingSpinner />
      </>
    );
  }

  const onCorrect = (start: string, end: string, reason: string) =>
    correctTimeEntry({
      orgId,
      teacherId,
      weekStart,
      shiftId: row!.shiftId,
      date: row!.date,
      start,
      end,
      reason,
    });

  if (draft === 'missing') {
    // Deleted from the schedule. If it was worked, its hours are still here.
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: row ? 'Removed Shift' : title }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="bodyLarge" style={styles.missingText}>
            {row
              ? 'This shift was removed from the schedule after it was worked.'
              : 'This shift no longer exists. Someone may have just removed it.'}
          </Text>
          {row && <TimeWorkedPanel row={row} onCorrect={onCorrect} />}
          <Button mode="outlined" onPress={() => router.back()} style={styles.close}>
            Close
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ShiftForm
        shift={draft}
        isNew={!shiftId}
        otherShifts={shifts}
        locations={locations}
        onSave={(s) => saveShift(orgId, teacherId, weekStart, s, user.uid)}
        onDelete={(s) => deleteShift(orgId, teacherId, weekStart, s.id, user.uid)}
        onDone={() => router.back()}
      >
        {row && <TimeWorkedPanel row={row} onCorrect={onCorrect} />}
      </ShiftForm>
    </>
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
  missingText: {
    color: '#666',
  },
  close: {
    marginTop: 24,
  },
});

