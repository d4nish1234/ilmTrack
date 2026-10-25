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

/**
 * The pickers need a Date, but a shift time is only a wall-clock time. Build it
 * on a fixed day with no daylight-saving change rather than today: on a
 * change day, times in the skipped hour don't exist (02:30 becomes 03:30 on
 * 8 March in Toronto), so the picker would show the wrong time.
 */
function toDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(2001, 0, 15, h, m, 0, 0);
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
