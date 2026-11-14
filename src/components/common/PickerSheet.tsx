import React, { useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { Tappable } from './Tappable';
import { colors, radius, spacing, typography } from '../../constants/theme';

/** How far below the screen the sheet starts before sliding up. */
const SLIDE_FROM = 400;
/** Opening and closing, in ms: quick, so the picker feels immediate. */
const OPEN_MS = 220;
const CLOSE_MS = 180;

interface PickerSheetProps {
  visible: boolean;
  /** Called once the sheet has slid away after Confirm; apply the value and hide it. */
  onConfirm: () => void;
  /** Called once the sheet has slid away after Cancel or a tap outside; just hide it. */
  onCancel: () => void;
  /** The picker. */
  children: React.ReactNode;
}

/**
 * A picker in a bottom sheet: the screen dims, the sheet slides up with the
 * picker, then Confirm and Cancel. Cancel, or a tap on the dimmed screen,
 * closes it without a change. Used by DateField and TimeField (iOS; Android's
 * pickers can't be embedded and open the system's own dialog instead).
 *
 * The sheet runs its own closing animation, then calls onConfirm or onCancel,
 * where the field sets `visible` back to false.
 */
export function PickerSheet({ visible, onConfirm, onCancel, children }: PickerSheetProps) {
  const insets = useSafeAreaInsets();
  // 0 closed, 1 open: drives the dimming and the slide together.
  const [progress] = useState(() => new Animated.Value(0));

  // The Modal has no animation of its own, so it appears at once and this
  // starts straight away (a fade-type Modal would hold the slide back).
  const animateIn = () => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeThen = (done: () => void) =>
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(done);

  const cancel = () => closeThen(onCancel);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={cancel} onShow={animateIn}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + spacing.sm,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE_FROM, 0] }) }],
          },
        ]}
      >
        {children}
        <Button onPress={() => closeThen(onConfirm)}>Confirm</Button>
        <Button mode="outlined" onPress={cancel} style={styles.cancel}>
          Cancel
        </Button>
      </Animated.View>
    </Modal>
  );
}

interface PickerFieldButtonProps {
  /** What's shown: 'Mon, Nov 3, 2026', '4:00 PM'. */
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}

/** The light-indigo value a DateField or TimeField shows; tap to change it. */
export function PickerFieldButton({ label, accessibilityLabel, onPress }: PickerFieldButtonProps) {
  return (
    <Tappable style={styles.field} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <Text variant={typography.h4} style={styles.fieldText}>
        {label}
      </Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cancel: {
    marginTop: 0,
  },
  field: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  fieldText: {
    color: colors.primary,
  },
});
