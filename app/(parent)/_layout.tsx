import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChildFilterProvider } from '../../src/contexts/ChildFilterContext';
import { colors, headerOptions } from '../../src/constants/theme';

export default function ParentLayout() {
  return (
    <ChildFilterProvider>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: true,
        ...headerOptions,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          // Cast: @expo/vector-icons' types predate React Native 0.88's ColorValue;
          // tab colours are always strings here.
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="homework"
        options={{
          title: 'Homework',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="clipboard-check"
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color as string} />
          ),
        }}
      />
      </Tabs>
    </ChildFilterProvider>
  );
}
