import { Stack } from 'expo-router';

export default function OrganizationLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a73e8',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        // Disable swipe-to-go-back gesture to prevent accidental navigation on older devices
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Organization',
        }}
      />
      <Stack.Screen
        name="timekeeping"
        options={{
          title: 'Timekeeping',
        }}
      />
      <Stack.Screen
        name="teacher/[teacherId]"
        options={{
          title: 'Shifts',
        }}
      />
      {/* Editors open as sheets, like Add Homework and Evaluate. */}
      <Stack.Screen
        name="shift"
        options={{
          title: 'Shift',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="location"
        options={{
          title: 'Location',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
