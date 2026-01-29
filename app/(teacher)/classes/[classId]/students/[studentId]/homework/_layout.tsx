import { Stack, router } from 'expo-router';
import { IconButton } from 'react-native-paper';

export default function HomeworkLayout() {
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
          title: 'Homework History',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor="#fff"
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <Stack.Screen
        name="add"
        options={{
          title: 'Add Homework',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
