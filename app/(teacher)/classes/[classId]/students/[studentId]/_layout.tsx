import { Stack } from 'expo-router';
import { colors, headerOptions } from '../../../../../../src/constants/theme';

export default function StudentDetailLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Student',
        }}
      />
      <Stack.Screen
        name="homework"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="attendance"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
