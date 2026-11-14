import React from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { radius, spacing } from '../../constants/theme';

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  mode?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: object;
  textColor?: string;
  buttonColor?: string;
}

export function Button({
  onPress,
  children,
  mode = 'contained',
  loading = false,
  disabled = false,
  icon,
  style,
  textColor,
  buttonColor,
}: ButtonProps) {
  return (
    <PaperButton
      mode={mode}
      onPress={onPress}
      loading={loading}
      disabled={disabled || loading}
      icon={icon}
      style={[styles.button, style]}
      contentStyle={styles.content}
      textColor={textColor}
      buttonColor={buttonColor}
    >
      {children}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  button: {
    marginVertical: spacing.sm,
    borderRadius: radius.md,
  },
  content: {
    paddingVertical: 6,
  },
});
