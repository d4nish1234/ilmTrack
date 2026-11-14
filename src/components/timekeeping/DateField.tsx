import React, { useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { PickerFieldButton, PickerSheet } from '../common';
import { colors } from '../../constants/theme';

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
 * A date, shown as a tappable 'Mon, Nov 3, 2026'. The one date control in the
 * app: use it for every date. On iOS it opens a calendar in a PickerSheet
 * (Confirm / Cancel; nothing changes until Confirm), like TimeField.
 * Android's picker can't be embedded, so it opens the system's calendar
 * dialog, with its own Cancel / OK.
 */
export function DateField({ value, onChange, minimumDate, maximumDate }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  // The date picked in the sheet, kept until Confirm.
  const [draft, setDraft] = useState(value);

  const limits = {
    minimumDate: minimumDate ? toDate(minimumDate) : undefined,
    maximumDate: maximumDate ? toDate(maximumDate) : undefined,
  };

  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'date',
        ...limits,
        // Only when a date is picked; dismissing does nothing.
        onValueChange: (_, date) => onChange(toValue(date)),
      });
      return;
    }
    setDraft(value);
    setOpen(true);
  };

  return (
    <>
      <PickerFieldButton
        label={format(toDate(value), 'EEE, MMM d, yyyy')}
        accessibilityLabel={`Date, ${format(toDate(value), 'EEEE, MMMM d, yyyy')}. Change`}
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
            mode="date"
            display="inline"
            accentColor={colors.primary}
            themeVariant="light"
            {...limits}
            onValueChange={(_, date) => setDraft(toValue(date))}
          />
        </PickerSheet>
      )}
    </>
  );
}
