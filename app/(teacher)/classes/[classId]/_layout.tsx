import { Stack } from 'expo-router';
import { headerOptions } from '../../../../src/constants/theme';

export default function ClassDetailLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        // Disable swipe-to-go-back gesture to prevent accidental navigation on older devices
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Class',
        }}
      />
      <Stack.Screen
        name="students"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          title: 'Edit Class',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="reports"
        options={{
          title: 'Reports',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
