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
              iconColor="#fff"
              size={24}
              style={{ margin: 0 }}
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
