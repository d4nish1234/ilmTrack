import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Divider, List, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import {
  setTimekeepingEnabled,
  subscribeToScheduleTemplates,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { AppSnackbar, LoadingSpinner } from '../../../src/components/common';
import type { ScheduleTemplate, TimekeepingSettings } from '../../../src/types';
import { hasEnded } from '../../../src/utils/scheduleTemplates';
import { todayIn } from '../../../src/utils/timekeeping';

/**
 * Timekeeping's setup, set up once and changed now and then: the on/off
 * switch, where teachers may start shifts, and a link to the schedule
 * templates. Opened from the Timekeeping screen's menu, so the main screen
 * leads with its people list however long it is.
 */
export default function TimekeepingSettingsScreen() {
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;
  const [settings, setSettings] = useState<TimekeepingSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setSettings(s);
        setLoaded(true);
      },
      (err) => {
        console.error('Error loading timekeeping settings:', err);
        setLoaded(true);
        setMessage("Couldn't load timekeeping settings.");
      }
    );
  }, [orgId]);

  const enabled = settings?.enabled === true;

  useEffect(() => {
    if (!orgId || !enabled) return;
    return subscribeToScheduleTemplates(orgId, setTemplates, (err) => console.error('Error loading schedules:', err));
  }, [orgId, enabled]);

  const setEnabled = async (value: boolean) => {
    if (!orgId || !user) return;
    setToggling(true);
    try {
      await setTimekeepingEnabled(orgId, value, user.uid);
    } catch (err) {
      console.error('Error changing timekeeping:', err);
      setMessage("Couldn't change timekeeping. Please try again.");
    } finally {
      setToggling(false);
    }
  };

  // Turning it off hides shifts from every teacher, so it asks first.
  const toggle = (value: boolean) => {
    if (value) {
      setEnabled(true);
      return;
    }
    Alert.alert(
      'Turn off timekeeping?',
      "Teachers won't see their shifts or be able to start them. Shifts, schedules and hours are kept, and come back when you turn it on again.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: () => setEnabled(false) },
      ]
    );
  };

  if (!loaded) return <LoadingSpinner />;

  const locations = settings?.locations ?? [];
  const activeTemplates = templates.filter((t) => !hasEnded(t, todayIn(settings?.timezone))).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <List.Item
          title="Timekeeping"
          titleStyle={styles.switchTitle}
          description={enabled ? 'Teachers with shifts can start them' : 'Off — teachers see nothing'}
          right={() => <Switch value={enabled} onValueChange={toggle} disabled={toggling} />}
          style={styles.switchRow}
        />

        {enabled && (
          <>
            <Divider />
            <List.Section>
              <List.Subheader>Locations</List.Subheader>
              {locations.map((l) => (
                <List.Item
                  key={l.id}
                  title={l.name}
                  description={[l.address, `within ${l.radiusM} m`].filter(Boolean).join(' · ')}
                  descriptionNumberOfLines={2}
                  left={(props) => <List.Icon {...props} icon="map-marker" />}
                  right={(props) => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() =>
                    router.push({
                      pathname: '/(teacher)/organization/location',
                      params: { locationId: l.id },
                    })
                  }
                />
              ))}
              <List.Item
                title="Add location"
                titleStyle={styles.addText}
                description={locations.length === 0 ? 'Where teachers have to be to start a shift' : undefined}
                left={(props) => <List.Icon {...props} icon="plus" color="#1a73e8" />}
                onPress={() => router.push('/(teacher)/organization/location')}
              />
            </List.Section>

            {locations.length > 0 && (
              <>
                <Divider />
                <List.Section>
                  <List.Subheader>Schedules</List.Subheader>
                  <List.Item
                    title="Schedules"
                    description={
                      activeTemplates === 0
                        ? 'The same shifts for many people, for a term or any dates'
                        : `${activeTemplates} active`
                    }
                    left={(props) => <List.Icon {...props} icon="calendar-sync" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => router.push('/(teacher)/organization/schedules')}
                  />
                </List.Section>
              </>
            )}
          </>
        )}
      </ScrollView>

      <AppSnackbar message={message} onDismiss={() => setMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  switchRow: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
  },
  switchTitle: {
    fontWeight: '600',
    fontSize: 18,
  },
  addText: {
    color: '#1a73e8',
  },
});
