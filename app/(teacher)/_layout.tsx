import { Tabs, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SelectedClassProvider } from '../../src/contexts/SelectedClassContext';

export default function TeacherLayout() {
  return (
    <SelectedClassProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1a73e8',
          tabBarInactiveTintColor: '#5f6368',
          headerShown: true,
          headerStyle: {
            backgroundColor: '#1a73e8',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="home" size={size} color={color} />
            ),
          }}
          listeners={{
            tabPress: () => {
              router.navigate('/(teacher)');
            },
          }}
        />
        <Tabs.Screen
          name="classes"
          options={{
            title: 'Classes',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="google-classroom"
                size={size}
                color={color}
              />
            ),
            headerShown: false,
          }}
          listeners={{
            tabPress: (e) => {
              // Navigate to classes index to reset the stack
              router.navigate('/(teacher)/classes');
            },
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="cog" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="help"
          options={{
            href: null, // Hide from tab bar
            title: 'Help & Support',
          }}
        />
      </Tabs>
    </SelectedClassProvider>
  );
}
