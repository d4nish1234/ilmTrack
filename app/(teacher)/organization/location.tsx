import React, { useEffect, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import {
  deleteLocation,
  newId,
  saveLocation,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { LoadingSpinner } from '../../../src/components/common';
import { LocationForm } from '../../../src/components/timekeeping/LocationForm';
import type { TimekeepingLocation } from '../../../src/types';

/**
 * Add or edit a timekeeping location, as a sheet over the Timekeeping screen.
 * Pass `locationId` to edit; omit it to add.
 */
export default function LocationScreen() {
  const { locationId } = useLocalSearchParams<{ locationId?: string }>();
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;

  // undefined while loading; null for a new location (or one just deleted).
  const [location, setLocation] = useState<TimekeepingLocation | null | undefined>(
    locationId ? undefined : null
  );

  useEffect(() => {
    if (!orgId || !locationId) return;
    // Read once: the form keeps its own state from here on.
    let first = true;
    const unsubscribe = subscribeToTimekeeping(
      orgId,
      (s) => {
        if (!first) return;
        first = false;
        setLocation(s?.locations.find((l) => l.id === locationId) ?? null);
      },
      (err) => {
        console.error('Error loading location:', err);
        setLocation(null);
      }
    );
    return unsubscribe;
  }, [orgId, locationId]);

  const title = locationId ? 'Edit Location' : 'Add Location';

  if (!orgId || !user || location === undefined) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <LocationForm
        location={location}
        newId={newId}
        onSave={(l) => saveLocation(orgId, l, user.uid)}
        onDelete={(l) => deleteLocation(orgId, l.id, user.uid)}
        onDone={() => router.back()}
      />
    </>
  );
}
