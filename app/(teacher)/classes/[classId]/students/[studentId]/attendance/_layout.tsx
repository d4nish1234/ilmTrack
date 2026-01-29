import { Stack } from 'expo-router';

export default function AttendanceLayout() {
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
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Attendance History',
        }}
      />
      <Stack.Screen
        name="add"
        options={{
          title: 'Add Attendance',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
