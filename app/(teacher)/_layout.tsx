import { Tabs, router, useSegments } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SelectedClassProvider } from '../../src/contexts/SelectedClassContext';
import { useOrganizations } from '../../src/contexts/OrganizationContext';
import { TimeClockProvider } from '../../src/contexts/TimeClockContext';

/**
 * Organization screens shown without the tab bar, so the action pinned to
 * their bottom (Save, Export, Continue) sits where the tabs were. Add every
 * edit screen here: see "Edit screens" in app/(teacher)/CLAUDE.md. (Sheets
 * opened with presentation: 'modal' already cover the tabs.)
 */
const NO_TAB_BAR = new Set(['schedule', 'timesheet-export', 'choose-people']);

export default function TeacherLayout() {
  const { organizations } = useOrganizations();
  const segments = useSegments() as string[];
  const hideTabBar = segments[1] === 'organization' && NO_TAB_BAR.has(segments[2] ?? '');

  return (
    <SelectedClassProvider>
      <TimeClockProvider>
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
              tabBarStyle: hideTabBar ? { display: 'none' } : undefined,
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
      </TimeClockProvider>
    </SelectedClassProvider>
  );
}
