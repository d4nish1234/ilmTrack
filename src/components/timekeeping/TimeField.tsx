import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MINUTE_STEP, formatTime, fromMinutes, snapToStep } from '../../utils/timekeeping';

interface TimeFieldProps {
  /** 'HH:mm' */
  value: string;
  onChange: (value: string) => void;
}

function toDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * The picked time, rounded to the nearest step. Both pickers are asked for
 * 5-minute steps, but neither guarantees it on every OS version and style
 * (iOS documents it for the spinner only), so the rounding happens here too.
 */
function toTime(date: Date): string {
  return fromMinutes(snapToStep(date.getHours() * 60 + date.getMinutes()));
}

/**
 * A time, in the platform's own picker: the compact inline control on iOS,
 * the clock dialog on Android. Both move in MINUTE_STEP steps.
 */
export function TimeField({ value, onChange }: TimeFieldProps) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={toDate(value)}
        mode="time"
        display="compact"
        minuteInterval={MINUTE_STEP}
        onChange={(_, date) => date && onChange(toTime(date))}
      />
    );
  }

  return (
    <Pressable
      style={styles.androidButton}
      accessibilityRole="button"
      onPress={() =>
        DateTimePickerAndroid.open({
          value: toDate(value),
          mode: 'time',
          is24Hour: false,
          minuteInterval: MINUTE_STEP,
          onChange: (event, date) => {
            if (event.type === 'set' && date) onChange(toTime(date));
          },
        })
      }
    >
      <Text variant="titleMedium" style={styles.androidText}>
        {formatTime(value)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  androidButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eef3fd',
  },
  androidText: {
    color: '#1a73e8',
  },
});
