import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';
import { colors, spacing } from '../../constants/theme';

/** Paper's standard floating button size. */
const SIZE = 56;

interface AddButtonProps {
  onPress: () => void;
  /** What it adds, for screen readers: 'Add student'. */
  accessibilityLabel: string;
}

/**
 * The round + floating in a screen's bottom-right corner: lighter indigo with
 * a white plus. Every "add" FAB uses it, so they all look the same.
 */
export function AddButton({ onPress, accessibilityLabel }: AddButtonProps) {
  return (
    <FAB
      icon="plus"
      color={colors.onPrimary}
      style={styles.fab}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.primaryLight,
    // Round: Paper takes the radius from here for the press area too.
    borderRadius: SIZE / 2,
  },
});
