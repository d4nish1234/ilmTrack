import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { colors, radius, typography } from '../../constants/theme';

interface DateFieldProps {
  /** 'yyyy-MM-dd' */
  value: string;
  onChange: (value: string) => void;
  minimumDate?: string;
  maximumDate?: string;
}

/**
 * The picker needs a Date, but this is only a calendar date. Build it at noon
 * so no timezone or daylight-saving change can move it to another day.
 */
function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const toValue = (date: Date) => format(date, 'yyyy-MM-dd');

/**
 * A date, in the platform's own picker: the compact inline control on iOS,
 * the calendar dialog on Android. The partner of TimeField.
 */
export function DateField({ value, onChange, minimumDate, maximumDate }: DateFieldProps) {
  const limits = {
    minimumDate: minimumDate ? toDate(minimumDate) : undefined,
    maximumDate: maximumDate ? toDate(maximumDate) : undefined,
  };

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={toDate(value)}
        mode="date"
        display="compact"
        {...limits}
        onChange={(_, date) => date && onChange(toValue(date))}
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
          mode: 'date',
          ...limits,
          onChange: (event, date) => {
            if (event.type === 'set' && date) onChange(toValue(date));
          },
        })
      }
    >
      <Text variant={typography.h4} style={styles.androidText}>
        {format(toDate(value), 'EEE, MMM d, yyyy')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  androidButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  androidText: {
    color: colors.primary,
  },
});
