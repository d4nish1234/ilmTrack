import { Tabs, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SelectedClassProvider } from '../../src/contexts/SelectedClassContext';
import { useOrganizations } from '../../src/contexts/OrganizationContext';

export default function TeacherLayout() {
  const { organizations } = useOrganizations();

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
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="classes"
          options={{
            title: 'Classes',
            // Cast: @expo/vector-icons' types predate React Native 0.88's ColorValue;
            // tab colours are always strings here.
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="google-classroom"
                size={size}
                color={color as string}
              />
            ),
            headerShown: false,
          }}
          listeners={{
            tabPress: (e) => {
              router.navigate('/(teacher)/classes');
            },
          }}
        />
        <Tabs.Screen
          name="organization"
          options={{
            title: 'Organization',
            // Only for people who administer an organization.
            href: organizations.length > 0 ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="office-building" size={size} color={color as string} />
            ),
            headerShown: false,
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
    </SelectedClassProvider>
  );
}
