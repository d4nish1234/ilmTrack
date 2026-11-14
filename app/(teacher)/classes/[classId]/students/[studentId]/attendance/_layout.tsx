import { Stack, router } from 'expo-router';
import { IconButton } from 'react-native-paper';
import { colors, headerOptions } from '../../../../../../../src/constants/theme';

export default function AttendanceLayout() {
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
          title: 'Attendance History',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor={colors.onPrimary}
              size={24}
              style={{ margin: 0 }}
              onPress={() => router.back()}
            />
          ),
        }}
      />
    </Stack>
  );
}
