import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native-paper';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import {
  deleteShift,
  newId,
  saveShift,
  subscribeToTeacherWeek,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { Button, LoadingSpinner } from '../../../src/components/common';
import { ShiftForm } from '../../../src/components/timekeeping/ShiftForm';
import type { Shift, TimekeepingLocation } from '../../../src/types';

/**
 * Add or edit one shift, as a sheet over the teacher's week. Pass `shiftId` to
 * edit, or `date` to add. A new shift is prefilled from the week's last shift
 * so repeats are quick.
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
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  // Built once, from the first snapshots, so later updates don't reset what
  // the admin is typing.
  const [draft, setDraft] = useState<Shift | null | 'missing'>(null);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => setLocations(s?.locations ?? []),
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

  const title = shiftId ? 'Edit Shift' : 'Add Shift';

  if (!orgId || !teacherId || !weekStart || !user || !draft || !locations || !shifts) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <LoadingSpinner />
      </>
    );
  }

  if (draft === 'missing') {
    return (
      <View style={styles.missing}>
        <Stack.Screen options={{ title }} />
        <Text variant="bodyLarge" style={styles.missingText}>
          This shift no longer exists. Someone may have just removed it.
        </Text>
        <Button mode="outlined" onPress={() => router.back()}>
          Close
        </Button>
      </View>
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
      />
    </>
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  missingText: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
});
