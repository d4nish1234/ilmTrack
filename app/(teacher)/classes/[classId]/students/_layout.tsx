import { Stack } from 'expo-router';
import { colors, headerOptions } from '../../../../../src/constants/theme';

export default function StudentsLayout() {
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
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
