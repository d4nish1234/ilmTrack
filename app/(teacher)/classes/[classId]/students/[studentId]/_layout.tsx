import { Stack } from 'expo-router';

export default function StudentDetailLayout() {
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
