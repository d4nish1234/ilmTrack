import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { Button, useUnsavedChanges } from '../common';
import type { TimekeepingLocation } from '../../types';
import { RADIUS_OPTIONS_M, errorMessage, locationNameFrom, radiusChoice } from '../../utils/timekeeping';
import { colors, radius, spacing, typography } from '../../constants/theme';

interface LocationFormProps {
  /** The location being edited, or null for a new one. */
  location: TimekeepingLocation | null;
  newId: () => string;
  onSave: (location: TimekeepingLocation) => Promise<void>;
  onDelete: (location: TimekeepingLocation) => Promise<void>;
  /** Called after a save or delete: go back. */
  onDone: () => void;
}

type Pin = { latitude: number; longitude: number; address?: string };

const samePin = (a: Pin | null, b: Pin | null) =>
  a === b ||
  (!!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude && (a.address ?? '') === (b.address ?? ''));

function describePlace(place: Location.LocationGeocodedAddress | undefined): string | undefined {
  if (!place) return undefined;
  if (place.formattedAddress) return place.formattedAddress;
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
  return [street || place.name, place.city, place.region].filter(Boolean).join(', ') || undefined;
}

/**
 * Pin a location by standing there ("Use my current location") or by typing
 * an address. Once pinned, the search gives way to the address it resolved
 * to, so the admin can confirm the pin landed in the right place; the pencil
 * brings the search back with that address in it. Admins don't name a
 * location: its name is the address's first line (locationNameFrom).
 *
 * An edit screen (see "Edit screens" in app/(teacher)/CLAUDE.md): Save is
 * pinned to the bottom and shows once something has changed, there's no
 * Cancel, and going back with changes asks first.
 */
export function LocationForm({
  location,
  newId,
  onSave,
  onDelete,
  onDone,
}: LocationFormProps) {
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<Pin | null>(location ? { ...location } : null);
  // Searching for a place (a new location, or after the pencil) or showing the pin.
  const [searching, setSearching] = useState(!location);
  const [radiusM, setRadiusM] = useState(radiusChoice(location?.radiusM));
  const [busy, setBusy] = useState<'locating' | 'finding' | 'saving' | null>(null);
  // A problem finding the place (shown in the form) or saving (shown by Save).
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  // Saved or deleted: nothing left to ask about on the way out.
  const [done, setDone] = useState(false);

  const startPin: Pin | null = location
    ? { latitude: location.latitude, longitude: location.longitude, address: location.address }
    : null;
  // A saved 150 m shows as 250 m; that alone isn't a change to save.
  const changed = !done && (!samePin(pin, startPin) || radiusM !== radiusChoice(location?.radiusM));
  // While searching, a new place hasn't been picked yet.
  const problem = !pin || searching ? 'Pick an address or use your current location to save.' : null;

  /** Location permission is needed both to locate and (on Android) to look up addresses. */
  const ensurePermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') return true;
    setNeedsSettings(!canAskAgain);
    setError('Location permission is needed to place this location.');
    return false;
  };

  const resolveAddress = async (latitude: number, longitude: number) => {
    try {
      return describePlace((await Location.reverseGeocodeAsync({ latitude, longitude }))[0]);
    } catch {
      return undefined; // the pin is still good without a readable address
    }
  };

  const useCurrentLocation = async () => {
    setError(null);
    setBusy('locating');
    try {
      if (!(await ensurePermission())) return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const { latitude, longitude } = position.coords;
      setPin({ latitude, longitude, address: await resolveAddress(latitude, longitude) });
      setSearching(false);
    } catch {
      setError("Couldn't get your location. Check that Location Services are on and try again.");
    } finally {
      setBusy(null);
    }
  };

  const findAddress = async () => {
    if (!query.trim()) return;
    setError(null);
    setBusy('finding');
    try {
      if (!(await ensurePermission())) return;
      const [match] = await Location.geocodeAsync(query.trim());
      if (!match) {
        setError('No place found for that address. Try adding the city.');
        return;
      }
      setPin({
        latitude: match.latitude,
        longitude: match.longitude,
        address: (await resolveAddress(match.latitude, match.longitude)) ?? query.trim(),
      });
      setSearching(false);
    } catch {
      setError("Couldn't look up that address. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  /** The pencil: back to the search, starting from the pinned address. */
  const changePin = () => {
    setQuery(pin?.address ?? '');
    setError(null);
    setSearching(true);
  };

  const save = async () => {
    if (!pin || problem) return;
    setBusy('saving');
    setSaveError(null);
    try {
      await onSave({
        id: location?.id ?? newId(),
        name: locationNameFrom(pin.address, location?.name),
        ...(pin.address ? { address: pin.address } : {}),
        latitude: pin.latitude,
        longitude: pin.longitude,
        radiusM,
      });
      setDone(true);
    } catch (err) {
      setSaveError(errorMessage(err, "Couldn't save. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!location) return;
    setBusy('saving');
    try {
      await onDelete(location);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  };

  // Shifts keep pointing at a deleted location, and teachers cannot start
  // them until an admin picks another, so ask first.
  const confirmRemove = () => {
    if (!location) return;
    Alert.alert(
      `Delete ${location.name}?`,
      'Shifts set at this location will need a new location before teachers can start them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ]
    );
  };

  // Leaving with changes asks first: Keep editing, Discard, or Save.
  const unsaved = useUnsavedChanges(changed, problem ? undefined : save);
  // Back once saved or deleted, after the render that turned the guard off;
  // once, however often the screen re-renders on the way out.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (done) onDoneRef.current();
  }, [done]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerLeft: unsaved.headerLeft }} />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
      >
        {searching ? (
          <>
            <Button
              mode="outlined"
              icon="crosshairs-gps"
              onPress={useCurrentLocation}
              loading={busy === 'locating'}
              disabled={!!busy}
            >
              Use my current location
            </Button>

            <Text variant={typography.caption} style={styles.or}>
              or
            </Text>

            <TextInput
              label="Address"
              value={query}
              onChangeText={setQuery}
              mode="outlined"
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={findAddress}
              // After the pencil, straight into the address to change it.
              autoFocus={!!pin}
              right={
                <TextInput.Icon
                  icon="magnify"
                  onPress={findAddress}
                  disabled={!!busy || !query.trim()}
                />
              }
            />
          </>
        ) : (
          pin && (
            <View style={styles.pin}>
              <View style={styles.pinText}>
                <Text variant={typography.labelMedium} style={styles.pinLabel}>
                  Address
                </Text>
                <Text variant={typography.body}>
                  {pin.address ?? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
                </Text>
              </View>
              <IconButton
                icon="pencil"
                iconColor={colors.primary}
                onPress={changePin}
                disabled={!!busy}
                accessibilityLabel="Change address"
              />
            </View>
          )
        )}

        <Text variant={typography.bodyLarge} style={styles.radiusLabel}>
          How close teachers must be
        </Text>
        <SegmentedButtons
          value={String(radiusM)}
          onValueChange={(v) => setRadiusM(Number(v))}
          buttons={RADIUS_OPTIONS_M.map((m) => ({ value: String(m), label: `${m} m` }))}
        />

        {error && (
          <Text variant={typography.body} style={styles.error}>
            {error}
          </Text>
        )}
        {needsSettings && (
          <Button mode="text" onPress={() => Linking.openSettings()}>
            Open Settings
          </Button>
        )}

        {location && (
          <Button
            mode="outlined"
            textColor={colors.danger}
            onPress={confirmRemove}
            disabled={!!busy}
            style={styles.delete}
          >
            Delete location
          </Button>
        )}
      </KeyboardAwareScrollView>

      {changed && (
        <View style={styles.footer}>
          {(problem || saveError) && (
            <Text variant={typography.body} style={styles.footerError}>
              {problem ?? saveError}
            </Text>
          )}
          <Button onPress={save} loading={busy === 'saving'} disabled={!!busy || !!problem}>
            Save
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
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  or: {
    textAlign: 'center',
    color: colors.textDisabled,
    marginVertical: spacing.sm,
  },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  pinText: {
    flex: 1,
  },
  pinLabel: {
    color: colors.textSecondary,
    marginBottom: 2,
  },
  radiusLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.md,
  },
  delete: {
    marginTop: spacing.xl,
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
});
