import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Modal, Portal } from 'react-native-paper';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

interface KeyboardAwareModalProps {
  visible: boolean;
  onDismiss?: () => void;
  dismissable?: boolean;
  /** Style of the card itself (background, margin, padding, radius). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A react-native-paper Modal whose card rises with the keyboard, so the field
 * being typed in stays visible. Use it for any modal form.
 *
 * Paper centres the card on screen. Moving it up by half the keyboard's height
 * re-centres it in the space left above the keyboard, which keeps the whole
 * card visible as long as it fits in that space.
 *
 * Driven by react-native-keyboard-controller (needs the KeyboardProvider in
 * app/_layout.tsx), which reports the keyboard the same way on iOS and on
 * Android's edge-to-edge layout, where KeyboardAvoidingView is unreliable.
 */
export function KeyboardAwareModal({
  visible,
  onDismiss,
  dismissable = true,
  contentContainerStyle,
  children,
}: KeyboardAwareModalProps) {
  const { height } = useReanimatedKeyboardAnimation();
  // `height` runs from 0 to minus the keyboard height.
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: height.value / 2 }],
  }));

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} dismissable={dismissable}>
        <Reanimated.View style={[contentContainerStyle, lift]}>{children}</Reanimated.View>
      </Modal>
    </Portal>
  );
}
