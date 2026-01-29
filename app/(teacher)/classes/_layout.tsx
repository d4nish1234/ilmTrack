import { Stack } from 'expo-router';

export default function ClassesLayout() {
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
          title: 'My Classes',
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'Create Class',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="[classId]"
        options={{
          title: 'Class',
        }}
      />
    </Stack>
  );
}
