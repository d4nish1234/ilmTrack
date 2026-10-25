import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Modal, Portal, Text } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import { Button } from '../common';
import { TimeField } from './TimeField';
import type { Shift, TimekeepingLocation } from '../../types';
import { errorMessage, formatDuration, shiftMinutes, shiftProblem } from '../../utils/timekeeping';

interface ShiftEditorProps {
  /** The shift being edited, or a new one prefilled with a date and default times. */
  shift: Shift | null;
  isNew: boolean;
  /** The teacher's other shifts that week, to catch overlaps before saving. */
  otherShifts: Shift[];
  locations: TimekeepingLocation[];
  onSave: (shift: Shift) => Promise<void>;
  onDelete: (shift: Shift) => Promise<void>;
  onDismiss: () => void;
}

/** Start, end and (when there is a choice) location. Nothing else. */
export function ShiftEditor({
  shift,
  isNew,
  otherShifts,
  locations,
  onSave,
  onDelete,
  onDismiss,
}: ShiftEditorProps) {
  const [draft, setDraft] = useState<Shift | null>(shift);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(shift);
    setError(null);
  }, [shift]);

  if (!draft) return null;

  const problem = shiftProblem(draft, otherShifts);
  const locationMissing = !locations.some((l) => l.id === draft.locationId);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      onDismiss();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible
        onDismiss={() => !saving && onDismiss()}
        contentContainerStyle={styles.container}
      >
        <Text variant="titleLarge" style={styles.title}>
          {format(parseISO(draft.date), 'EEEE, MMM d')}
        </Text>

        <View style={styles.row}>
          <Text variant="bodyLarge">Start</Text>
          <TimeField value={draft.start} onChange={(start) => setDraft({ ...draft, start })} />
        </View>
        <View style={styles.row}>
          <Text variant="bodyLarge">End</Text>
          <TimeField value={draft.end} onChange={(end) => setDraft({ ...draft, end })} />
        </View>
        <View style={styles.row}>
          <Text variant="bodyLarge" style={styles.muted}>
            Total
          </Text>
          <Text variant="bodyLarge" style={styles.muted}>
            {formatDuration(shiftMinutes(draft))}
          </Text>
        </View>

        {(locations.length > 1 || locationMissing) && (
          <View style={styles.locations}>
            <Text variant="bodyLarge" style={styles.locationsLabel}>
              Location
            </Text>
            <View style={styles.chips}>
              {locations.map((l) => (
                <Chip
                  key={l.id}
                  selected={l.id === draft.locationId}
                  showSelectedOverlay
                  onPress={() => setDraft({ ...draft, locationId: l.id, locationName: l.name })}
                  style={styles.chip}
                >
                  {l.name}
                </Chip>
              ))}
            </View>
          </View>
        )}

        {(error || problem || locationMissing) && (
          <Text variant="bodyMedium" style={styles.error}>
            {error ?? problem ?? 'Choose a location.'}
          </Text>
        )}

        <View style={styles.actions}>
          <Button
            onPress={() => run(() => onSave(draft))}
            loading={saving}
            disabled={saving || !!problem || locationMissing}
          >
            Save
          </Button>
          {!isNew && (
            <Button
              mode="outlined"
              textColor="#d32f2f"
              onPress={() => run(() => onDelete(draft))}
              disabled={saving}
            >
              Delete shift
            </Button>
          )}
          <Button mode="text" onPress={onDismiss} disabled={saving}>
            Cancel
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  title: {
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  muted: {
    color: '#666',
  },
  locations: {
    marginTop: 8,
  },
  locationsLabel: {
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    marginRight: 8,
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
