import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, ScrollView, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { List, Text, Divider, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { getOrgTeachers } from '../../../src/services/organization.service';
import {
  deleteLocation,
  newId,
  saveLocation,
  setTimekeepingEnabled,
  subscribeToOrgWeek,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { LoadingSpinner, AppSnackbar } from '../../../src/components/common';
import { LocationEditor } from '../../../src/components/timekeeping/LocationEditor';
import type { OrgTeacher, TimekeepingLocation, TimekeepingSettings, WeekSchedule } from '../../../src/types';
import { currentWeekStart, weekSummary } from '../../../src/utils/timekeeping';

/**
 * Timekeeping for the selected organization: the on/off switch, where
 * teachers may start shifts, and each teacher's hours this week.
 */
export default function TimekeepingScreen() {
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;
  const [settings, setSettings] = useState<TimekeepingSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // In the organization's timezone, so an admin in another zone sees the
  // same week as the school near the Sunday/Monday boundary.
  const thisWeek = currentWeekStart(settings?.timezone);
  const [teachers, setTeachers] = useState<OrgTeacher[]>([]);
  const [week, setWeek] = useState<Map<string, WeekSchedule>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ location: TimekeepingLocation | null } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setSettingsLoaded(false);
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setSettings(s);
        setSettingsLoaded(true);
      },
      (err) => {
        console.error('Error loading timekeeping settings:', err);
        setSettingsLoaded(true);
        setMessage("Couldn't load timekeeping settings.");
      }
    );
  }, [orgId]);

  const enabled = settings?.enabled === true;

  useEffect(() => {
    if (!orgId || !enabled) return;
    return subscribeToOrgWeek(orgId, thisWeek, setWeek, (err) =>
      console.error('Error loading this week:', err)
    );
  }, [orgId, enabled, thisWeek]);

  const loadTeachers = useCallback(async () => {
    if (!orgId) return;
    try {
      setTeachers(await getOrgTeachers(orgId));
    } catch (err) {
      console.error('Error loading organization teachers:', err);
      setMessage("Couldn't load teachers. Pull down to try again.");
    }
  }, [orgId]);

  useEffect(() => {
    if (enabled) loadTeachers();
  }, [enabled, loadTeachers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeachers();
    setRefreshing(false);
  };

  const toggle = async (value: boolean) => {
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

  if (!settingsLoaded) return <LoadingSpinner />;

  const locations = settings?.locations ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        refreshControl={
          enabled ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        <List.Item
          title="Timekeeping"
          titleStyle={styles.switchTitle}
          description={
            enabled ? 'Teachers with shifts can start them' : 'Off — teachers see nothing'
          }
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
                  onPress={() => setEditing({ location: l })}
                />
              ))}
              <List.Item
                title="Add location"
                titleStyle={styles.addText}
                left={(props) => <List.Icon {...props} icon="plus" color="#1a73e8" />}
                onPress={() => setEditing({ location: null })}
              />
            </List.Section>

            <Divider />
            <List.Section>
              <List.Subheader>Teachers · this week</List.Subheader>
              {locations.length === 0 ? (
                <Text variant="bodyMedium" style={styles.hint}>
                  Add a location first, then set shifts for your teachers.
                </Text>
              ) : teachers.length === 0 ? (
                <Text variant="bodyMedium" style={styles.hint}>
                  No classes are linked to {selectedOrg?.name ?? 'this organization'} yet.
                </Text>
              ) : (
                teachers.map((t) => (
                  <List.Item
                    key={t.uid}
                    title={`${t.firstName} ${t.lastName}`}
                    description={weekSummary(week.get(t.uid)?.shifts ?? [])}
                    left={(props) => <List.Icon {...props} icon="account" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() =>
                      router.push({
                        pathname: '/(teacher)/organization/teacher/[teacherId]',
                        params: { teacherId: t.uid, name: `${t.firstName} ${t.lastName}` },
                      })
                    }
                  />
                ))
              )}
            </List.Section>
          </>
        )}

        {!enabled && (
          <View style={styles.offNote}>
            <Text variant="bodyMedium" style={styles.hint}>
              Turn on to add your school’s location and set weekly shifts for each teacher.
              Turning it off later hides it from teachers but keeps everything.
            </Text>
          </View>
        )}
      </ScrollView>

      {orgId && user && (
        <LocationEditor
          visible={editing !== null}
          location={editing?.location ?? null}
          newId={newId}
          onSave={(l) => saveLocation(orgId, l, user.uid)}
          onDelete={(l) => deleteLocation(orgId, l.id, user.uid)}
          onDismiss={() => setEditing(null)}
        />
      )}

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
  hint: {
    color: '#666',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  offNote: {
    paddingTop: 16,
  },
});
