import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, ScrollView, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { List, Text, Divider, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { getOrgTeachers } from '../../../src/services/organization.service';
import {
  setTimekeepingEnabled,
  subscribeToOrgWeek,
  subscribeToOrgWeekEntries,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { shareCsv } from '../../../src/services/export.service';
import { AppSnackbar, Button, LoadingSpinner } from '../../../src/components/common';
import type { OrgTeacher, TimeEntry, TimekeepingSettings, WeekSchedule } from '../../../src/types';
import { currentWeekStart } from '../../../src/utils/timekeeping';
import {
  clockedInNow,
  csvFileName,
  timesheetCsv,
  timesheetRows,
  workedOfScheduled,
} from '../../../src/utils/timesheet';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Timekeeping for the selected organization: the on/off switch, where
 * teachers may start shifts, who's on shift now, each teacher's hours this
 * week (worked against scheduled), and the week's CSV export.
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
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    if (!orgId || !enabled) return;
    return subscribeToOrgWeekEntries(orgId, thisWeek, setEntries, (err) =>
      console.error("Error loading this week's hours:", err)
    );
  }, [orgId, enabled, thisWeek]);

  const timezone = settings?.timezone ?? deviceTimezone();
  const locationNames = useMemo(
    () => new Map((settings?.locations ?? []).map((l) => [l.id, l.name])),
    [settings?.locations]
  );
  // Each teacher's rows, worked out once per change rather than per use.
  const rowsByTeacher = useMemo(
    () =>
      new Map(
        teachers.map((t) => [
          t.uid,
          timesheetRows(
            week.get(t.uid)?.shifts ?? [],
            entries.filter((e) => e.teacherId === t.uid),
            locationNames,
            timezone,
            now
          ),
        ])
      ),
    [teachers, week, entries, locationNames, timezone, now]
  );
  const rowsFor = (uid: string) => rowsByTeacher.get(uid) ?? [];
  const onShift = clockedInNow(entries, now);
  const nameOf = (uid: string) => {
    const t = teachers.find((x) => x.uid === uid);
    return t ? `${t.firstName} ${t.lastName}` : 'Someone';
  };

  const exportWeek = async () => {
    setExporting(true);
    try {
      const weeks = teachers.map((t) => ({
        teacher: { uid: t.uid, name: `${t.firstName} ${t.lastName}`, email: t.email },
        rows: rowsFor(t.uid),
      }));
      await shareCsv(csvFileName([selectedOrg?.name ?? ''], thisWeek), timesheetCsv(weeks));
    } catch (err) {
      console.error('Error exporting week:', err);
      setMessage("Couldn't export this week.");
    } finally {
      setExporting(false);
    }
  };

  // Beyond the teachers of its classes: its admins, who can track their own
  // time without teaching, and anyone scheduled or with hours this week (say,
  // removed from their last class mid-week), so no one's hours are left out.
  // A sorted string, so this reloads when that set changes, not on every
  // snapshot.
  const extraKey = [
    ...new Set([...(selectedOrg?.memberUserIds ?? []), ...week.keys(), ...entries.map((e) => e.teacherId)]),
  ]
    .sort()
    .join(',');
  const loadTeachers = useCallback(async () => {
    if (!orgId) return;
    try {
      setTeachers(await getOrgTeachers(orgId, extraKey ? extraKey.split(',') : []));
    } catch (err) {
      console.error('Error loading organization teachers:', err);
      setMessage("Couldn't load teachers. Pull down to try again.");
    }
  }, [orgId, extraKey]);

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
                left={(props) => <List.Icon {...props} icon="plus" color="#1a73e8" />}
                onPress={() => router.push('/(teacher)/organization/location')}
              />
            </List.Section>

            <Divider />
            <List.Item
              title={onShift.length === 0 ? 'No one is clocked in' : `Clocked in now · ${onShift.length}`}
              description={
                onShift.length === 0
                  ? undefined
                  : onShift
                      .map((e) => `${nameOf(e.teacherId)}${e.status === 'paused' ? ' (on break)' : ''}`)
                      .join(', ')
              }
              descriptionNumberOfLines={3}
              left={(props) => (
                <List.Icon {...props} icon="account-clock" color={onShift.length ? '#1e7e34' : undefined} />
              )}
            />

            <Divider />
            <List.Section>
              <List.Subheader>Teachers · this week · worked / scheduled</List.Subheader>
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
                    description={
                      rowsFor(t.uid).length === 0
                        ? 'No shifts'
                        : `${workedOfScheduled(rowsFor(t.uid))}${onShift.some((e) => e.teacherId === t.uid) ? ' · ● on shift' : ''}`
                    }
                    left={(props) => <List.Icon {...props} icon="account" />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() =>
                      router.push({
                        pathname: '/(teacher)/organization/teacher/[teacherId]',
                        params: { teacherId: t.uid, name: `${t.firstName} ${t.lastName}`, email: t.email },
                      })
                    }
                  />
                ))
              )}
            </List.Section>
            {teachers.length > 0 && (
              <View style={styles.export}>
                <Button
                  mode="outlined"
                  icon="file-delimited-outline"
                  onPress={exportWeek}
                  loading={exporting}
                  disabled={exporting}
                >
                  Export this week (CSV)
                </Button>
              </View>
            )}
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
  export: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  offNote: {
    paddingTop: 16,
  },
});
