import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTimeClock } from '../../contexts/TimeClockContext';
import { barContent } from '../../utils/timeclock';
import { useAppTheme } from '../../constants/theme';

/**
 * One slim row on the Classes screen, so the student list keeps its room.
 * Its colour says where the teacher stands — green on shift, amber on break,
 * blue when a shift can be started, grey otherwise — and a tap opens the Time
 * sheet. Shown to anyone in an organization with timekeeping on, even before
 * they're scheduled, so teachers know it exists; hidden for everyone else.
 */
export function TimeClockBar() {
  const { focus, now, pendingEndId } = useTimeClock();
  const { colors } = useAppTheme();
  if (focus.kind === 'none') return null;

  const { tone, icon, label, action } = barContent(focus, now, pendingEndId);
  const { bg, fg } = colors.timeClock[tone];
  return (
    <Pressable
      onPress={() => router.push('/(teacher)/classes/time')}
      style={({ pressed }) => [styles.bar, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open time clock.`}
    >
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={fg} />
      <Text variant="bodyMedium" style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.right}>
        {!!action && (
          <Text variant="labelLarge" style={{ color: fg }}>
            {action}
          </Text>
        )}
        <MaterialCommunityIcons name="chevron-right" size={18} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  label: {
    flex: 1,
    fontWeight: '600',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
