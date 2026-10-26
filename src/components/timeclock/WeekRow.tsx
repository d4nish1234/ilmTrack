import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import { formatWorked, workedMs } from '../../utils/timeclock';
import { formatTime } from '../../utils/timekeeping';
import type { ShiftView } from '../../types';
import { useAppTheme } from '../../constants/theme';

const shiftTimes = (s: ShiftView) => `${formatTime(s.start)}–${formatTime(s.end)}`;

/** One shift in a week list: day, times, place, and what was worked. */
export function WeekRow({ shift, now, showOrg }: { shift: ShiftView; now: number; showOrg: boolean }) {
  const tone = useAppTheme().colors.timeClock;
  const status = shift.entry?.status;
  const right =
    status === 'running'
      ? 'On shift'
      : status === 'paused'
        ? 'On break'
        : status === 'done'
          ? formatWorked(workedMs(shift.entry!, shift.startAt, shift.endAt, now))
          : now >= shift.endAt
            ? 'Not started'
            : '';
  return (
    <View style={styles.row}>
      <View style={styles.rowDay}>
        <Text variant="titleSmall">{format(parseISO(shift.date), 'EEE')}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {format(parseISO(shift.date), 'd')}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <Text variant="bodyMedium">{shiftTimes(shift)}</Text>
        <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
          {[shift.locationName, showOrg ? shift.orgName : ''].filter(Boolean).join(' · ')}
        </Text>
        {shift.entry?.correction && (
          <Text variant="bodySmall" style={{ color: tone.paused.fg }} numberOfLines={2}>
            Edited by admin: {shift.entry.correction.reason}
          </Text>
        )}
      </View>
      <Text
        variant="bodyMedium"
        style={[
          styles.rowRight,
          status === 'running' && { color: tone.running.fg },
          status === 'paused' && { color: tone.paused.fg },
          right === 'Not started' && styles.muted,
        ]}
      >
        {right}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: '#666',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowDay: {
    width: 44,
  },
  rowMain: {
    flex: 1,
  },
  rowRight: {
    marginLeft: 8,
    fontWeight: '600',
  },
});
