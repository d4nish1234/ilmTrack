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
        name="timekeeping-settings"
        options={{
          title: 'Timekeeping Settings',
        }}
      />
      <Stack.Screen
        name="schedules"
        options={{
          title: 'Schedules',
        }}
      />
      <Stack.Screen
        name="schedule"
        options={{
          title: 'Schedule',
        }}
      />
      <Stack.Screen
        name="timesheet-export"
        options={{
          title: 'Export Timesheet',
        }}
      />
      <Stack.Screen
        name="choose-people"
        options={{
          title: 'Choose People',
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
      {/* Feature help: a native bottom sheet, as tall as its content. Unlike
          the editors, it can be swiped down or closed by tapping the dimmed
          screen behind it (nothing to lose); each counts as dismissing it. */}
      <Stack.Screen
        name="timekeeping-help"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: 'none',
          gestureEnabled: true,
          headerShown: false,
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
