import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface TappableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

/** How faded something is while pressed. */
const PRESSED_OPACITY = 0.6;

/**
 * Anything tappable that isn't a Button, list row or chip: a card, a custom
 * cell, a row of text. Fades while pressed, and dims when disabled. Use this
 * rather than TouchableOpacity or a bare Pressable, so every tap looks the
 * same.
 */
export function Tappable({ style, disabled, accessibilityRole = 'button', ...props }: TappableProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [style, pressed && { opacity: PRESSED_OPACITY }]}
    />
  );
}
