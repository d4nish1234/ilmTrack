import React, { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { PickerFieldButton, PickerSheet } from '../common';
import { MINUTE_STEP, formatTime, fromMinutes, snapToStep } from '../../utils/timekeeping';
import { colors } from '../../constants/theme';

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
 * A time, shown as a tappable '4:00 PM', in MINUTE_STEP steps. On iOS it opens
 * the time wheel in a PickerSheet (Confirm / Cancel; nothing changes until
 * Confirm), like DateField. Android opens the system's clock dialog.
 */
export function TimeField({ value, onChange }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  // The time picked in the sheet, kept until Confirm.
  const [draft, setDraft] = useState(value);

  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'time',
        is24Hour: false,
        minuteInterval: MINUTE_STEP,
        // Only when a time is picked; dismissing does nothing.
        onValueChange: (_, date) => onChange(toTime(date)),
      });
      return;
    }
    setDraft(value);
    setOpen(true);
  };

  return (
    <>
      <PickerFieldButton
        label={formatTime(value)}
        accessibilityLabel={`Time, ${formatTime(value)}. Change`}
        onPress={show}
      />
      {Platform.OS === 'ios' && (
        <PickerSheet
          visible={open}
          onConfirm={() => {
            setOpen(false);
            onChange(draft);
          }}
          onCancel={() => setOpen(false)}
        >
          <DateTimePicker
            value={toDate(draft)}
            mode="time"
            display="spinner"
            minuteInterval={MINUTE_STEP}
            textColor={colors.text}
            themeVariant="light"
            style={styles.wheel}
            onValueChange={(_, date) => setDraft(toTime(date))}
          />
        </PickerSheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wheel: {
    alignSelf: 'center',
  },
});
