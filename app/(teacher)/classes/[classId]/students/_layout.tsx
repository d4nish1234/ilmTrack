import { Stack } from 'expo-router';

export default function StudentsLayout() {
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
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="add"
        options={{
          title: 'Add Student',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="[studentId]"
        options={{
          title: 'Student',
        }}
      />
    </Stack>
  );
}
