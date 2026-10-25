import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';
import * as Location from 'expo-location';
import { Button, KeyboardAwareModal } from '../common';
import type { TimekeepingLocation } from '../../types';
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M, errorMessage } from '../../utils/timekeeping';

interface LocationEditorProps {
  /** The location being edited, or null for a new one. */
  location: TimekeepingLocation | null;
  visible: boolean;
  newId: () => string;
  onSave: (location: TimekeepingLocation) => Promise<void>;
  onDelete: (location: TimekeepingLocation) => Promise<void>;
  onDismiss: () => void;
}

type Pin = { latitude: number; longitude: number; address?: string };

function describePlace(place: Location.LocationGeocodedAddress | undefined): string | undefined {
  if (!place) return undefined;
  if (place.formattedAddress) return place.formattedAddress;
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
  return [street || place.name, place.city, place.region].filter(Boolean).join(', ') || undefined;
}

/**
 * Pin a location by standing there ("Use my current location") or by typing
 * an address. The address it resolves to is shown so the admin can confirm
 * the pin landed in the right place.
 */
export function LocationEditor({
  location,
  visible,
  newId,
  onSave,
  onDelete,
  onDismiss,
}: LocationEditorProps) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState<Pin | null>(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [busy, setBusy] = useState<'locating' | 'finding' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(location?.name ?? '');
    setQuery('');
    setPin(location ? { ...location } : null);
    setRadiusM(location?.radiusM ?? DEFAULT_RADIUS_M);
    setError(null);
    setNeedsSettings(false);
  }, [visible, location]);

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
    } catch {
      setError("Couldn't look up that address. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!pin || !name.trim()) return;
    setBusy('saving');
    setError(null);
    try {
      await onSave({
        id: location?.id ?? newId(),
        name: name.trim(),
        ...(pin.address ? { address: pin.address } : {}),
        latitude: pin.latitude,
        longitude: pin.longitude,
        radiusM,
      });
      onDismiss();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!location) return;
    setBusy('saving');
    try {
      await onDelete(location);
      onDismiss();
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

  return (
    <KeyboardAwareModal
      visible={visible}
      onDismiss={() => !busy && onDismiss()}
      contentContainerStyle={styles.container}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text variant="titleLarge" style={styles.title}>
          {location ? 'Edit location' : 'Add location'}
        </Text>

        <TextInput
          label="Name"
          placeholder="Main campus"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
          autoCapitalize="words"
        />

        <Button
          mode="outlined"
          icon="crosshairs-gps"
          onPress={useCurrentLocation}
          loading={busy === 'locating'}
          disabled={!!busy}
        >
          Use my current location
        </Button>

        <Text variant="bodySmall" style={styles.or}>
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
          right={
            <TextInput.Icon
              icon="magnify"
              onPress={findAddress}
              disabled={!!busy || !query.trim()}
            />
          }
        />

        {pin && (
          <View style={styles.pin}>
            <Text variant="labelMedium" style={styles.pinLabel}>
              Pinned at
            </Text>
            <Text variant="bodyMedium">
              {pin.address ?? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
            </Text>
          </View>
        )}

        <Text variant="bodyLarge" style={styles.radiusLabel}>
          How close teachers must be
        </Text>
        <SegmentedButtons
          value={String(radiusM)}
          onValueChange={(v) => setRadiusM(Number(v))}
          buttons={RADIUS_OPTIONS_M.map((m) => ({ value: String(m), label: `${m} m` }))}
        />

        {error && (
          <Text variant="bodyMedium" style={styles.error}>
            {error}
          </Text>
        )}
        {needsSettings && (
          <Button mode="text" onPress={() => Linking.openSettings()}>
            Open Settings
          </Button>
        )}

        <View style={styles.actions}>
          <Button
            onPress={save}
            loading={busy === 'saving'}
            disabled={!!busy || !pin || !name.trim()}
          >
            Save
          </Button>
          {location && (
            <Button mode="outlined" textColor="#d32f2f" onPress={confirmRemove} disabled={!!busy}>
              Delete location
            </Button>
          )}
          <Button mode="text" onPress={onDismiss} disabled={!!busy}>
            Cancel
          </Button>
        </View>
      </ScrollView>
    </KeyboardAwareModal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 12,
    maxHeight: '90%',
  },
  title: {
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  or: {
    textAlign: 'center',
    color: '#888',
    marginVertical: 8,
  },
  pin: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  pinLabel: {
    color: '#666',
    marginBottom: 2,
  },
  radiusLabel: {
    marginTop: 4,
    marginBottom: 8,
  },
  error: {
    color: '#d32f2f',
    marginTop: 12,
  },
  actions: {
    marginTop: 16,
  },
});
