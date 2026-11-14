import { Stack } from 'expo-router';
import { colors, headerOptions } from '../../../src/constants/theme';

/**
 * Settings and the pages it opens. Help lives here as a pushed screen rather
 * than as a tab hidden with `href: null`: since expo-router 58 a hidden tab
 * can't be navigated to — focusing one redirects to the first tab.
 */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
        }}
      />
      <Stack.Screen
        name="help"
        options={{
          title: 'Help & Support',
        }}
      />
    </Stack>
  );
}
