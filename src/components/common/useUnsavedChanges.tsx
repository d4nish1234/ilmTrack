import React, { useEffect, useRef, useState } from 'react';
import { Alert, type ColorValue } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import { HeaderBackButton } from 'expo-router/react-navigation';

/**
 * Stops an edit screen being left (header back, Android back, or code going
 * back) while `changed`, and asks with the phone's own alert, like the rest
 * of the app's confirmations: Keep editing, Discard, or Save. Leave `onSave`
 * out while the form can't be saved yet; the alert then offers only Keep
 * editing and Discard. See "Edit screens" in app/(teacher)/CLAUDE.md.
 *
 * After a save or delete, make `changed` false (a `done` flag) and go back
 * from an effect, so it doesn't ask about changes that are now saved.
 *
 * Pass `headerLeft` to the screen's options: iOS's own back button, when its
 * press is stopped, stays dimmed (half pressed); this one looks the same but
 * goes back from JavaScript, so the press always finishes.
 */
export function useUnsavedChanges(changed: boolean, onSave?: () => void) {
  // The latest save, for an alert that may open several renders from now.
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  const [discarded, setDiscarded] = useState(false);

  usePreventRemove(changed && !discarded, ({ repeat }) => {
    const save = saveRef.current;
    Alert.alert(
      'Unsaved changes',
      save
        ? "You've made changes that aren't saved yet. Save them before you go, or discard them."
        : "You've made changes that can't be saved yet. Keep editing to finish them, or discard them.",
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setDiscarded(true);
            repeat();
          },
        },
        ...(save ? [{ text: 'Save', onPress: save }] : []),
      ]
    );
  });

  return {
    headerLeft: (props: { tintColor?: ColorValue; label?: string; href?: string }) => (
      <HeaderBackButton {...props} onPress={() => router.back()} />
    ),
  };
}
