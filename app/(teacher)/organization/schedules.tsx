import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { List, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { subscribeToScheduleTemplates, subscribeToTimekeeping } from '../../../src/services/timekeeping.service';
import { AppSnackbar, LoadingSpinner } from '../../../src/components/common';
import type { ScheduleTemplate, TimekeepingSettings } from '../../../src/types';
import { hasEnded, templateDescription, templateTitle } from '../../../src/utils/scheduleTemplates';
import { todayIn } from '../../../src/utils/timekeeping';

/**
 * The organization's schedule templates: current and upcoming ones, Add
 * schedule, and ended ones folded away. Opened from the Timekeeping screen.
 */
export default function SchedulesScreen() {
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;
  const [settings, setSettings] = useState<TimekeepingSettings | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(orgId, setSettings, (err) => console.error('Error loading timekeeping settings:', err));
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToScheduleTemplates(orgId, setTemplates, (err) => {
      console.error('Error loading schedules:', err);
      setTemplates([]);
      setMessage("Couldn't load schedules.");
    });
  }, [orgId]);

  if (!templates) return <LoadingSpinner />;

  const today = todayIn(settings?.timezone);
  const thisYear = new Date().getFullYear();
  const current = templates.filter((t) => !hasEnded(t, today));
  const ended = templates.filter((t) => hasEnded(t, today));
  const hasLocations = (settings?.locations ?? []).length > 0;

  const row = (t: ScheduleTemplate) => (
    <List.Item
      key={t.id}
      title={templateTitle(t, thisYear)}
      description={templateDescription(t)}
      descriptionNumberOfLines={2}
      left={(props) => <List.Icon {...props} icon="calendar-sync" />}
      right={(props) => <List.Icon {...props} icon="chevron-right" />}
      onPress={() => router.push({ pathname: '/(teacher)/organization/schedule', params: { templateId: t.id } })}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <Text variant="bodyMedium" style={styles.intro}>
          The same shifts for many people, for a term or any dates. Changes apply to everyone&apos;s weeks straight away.
        </Text>
        <List.Section>
          {current.map(row)}
          {hasLocations ? (
            <List.Item
              title="Add schedule"
              titleStyle={styles.addText}
              left={(props) => <List.Icon {...props} icon="plus" color="#1a73e8" />}
              onPress={() => router.push('/(teacher)/organization/schedule')}
            />
          ) : (
            <Text variant="bodyMedium" style={styles.intro}>
              Add a location first, in Timekeeping Settings.
            </Text>
          )}
          {ended.length > 0 && (
            <List.Accordion title={`Ended · ${ended.length}`} left={(props) => <List.Icon {...props} icon="calendar-check" />}>
              {ended.map(row)}
            </List.Accordion>
          )}
        </List.Section>
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
  intro: {
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  addText: {
    color: '#1a73e8',
  },
});
