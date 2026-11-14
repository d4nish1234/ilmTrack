import { Stack, router } from 'expo-router';
import { IconButton } from 'react-native-paper';
import { colors, headerOptions } from '../../../../../../../src/constants/theme';

export default function HomeworkLayout() {
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
          title: 'Homework History',
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
      <Stack.Screen
        name="edit"
        options={{
          title: 'Edit Homework',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
