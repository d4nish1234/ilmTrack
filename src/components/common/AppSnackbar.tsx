import React from 'react';
import { StyleSheet } from 'react-native';
import { Snackbar, Portal } from 'react-native-paper';

interface AppSnackbarProps {
  type?: 'error' | 'success';
  message: string | null;
  onDismiss: () => void;
  wrapInPortal?: boolean;
}

export function AppSnackbar({
  type = 'error',
  message,
  onDismiss,
  wrapInPortal = true,
}: AppSnackbarProps) {
  const snackbar = (
    <Snackbar
      visible={!!message}
      onDismiss={onDismiss}
      duration={type === 'success' ? 2000 : 4000}
      style={type === 'success' ? styles.success : undefined}
    >
      {message}
    </Snackbar>
  );

  if (wrapInPortal) {
    return <Portal>{snackbar}</Portal>;
  }

  return snackbar;
}

const styles = StyleSheet.create({
  success: {
    backgroundColor: '#2e7d32',
  },
});
