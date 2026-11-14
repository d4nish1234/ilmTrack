import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, ScrollView, RefreshControl, View, Pressable, type ScrollViewInstance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { Dialog, Divider, IconButton, List, Menu, Portal, SegmentedButtons, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { byName, getOrgTeachers, getPeople } from '../../../src/services/organization.service';
import {
  setTimekeepingEnabled,
  subscribeToOrgWeek,
  subscribeToOrgWeekEntries,
  subscribeToTimekeeping,
} from '../../../src/services/timekeeping.service';
import { AppSnackbar, Button, HelpLink, LoadingSpinner } from '../../../src/components/common';
import { hasSeenHelp } from '../../../src/utils/storage';
import { WeekGrid, WeekGridHeader, useGridColumn } from '../../../src/components/timekeeping/WeekGrid';
import type { OrgTeacher, TimeEntry, TimekeepingSettings, WeekSchedule } from '../../../src/types';
import { currentWeekStart, formatTime, shiftWeek, todayIn, weekDates } from '../../../src/utils/timekeeping';
import { clockedInNow, timesheetRows, workedOfScheduled } from '../../../src/utils/timesheet';
import { gridDates, weekRangeLabel, type GridCell } from '../../../src/utils/weekGrid';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const MENU_DEBOUNCE_MS = 300;
/** Where this phone remembers List or Week. A convenience: losing it just shows the list. */
const VIEW_KEY = 'timekeeping.view';
type GridView = 'list' | 'week';
/** Names in the on-shift strip before "+N". */
const STRIP_NAMES = 2;

/**
 * Timekeeping for the selected organization, built around the week: a pager,
 * who's on shift now, and everyone's hours as a list (worked against
 * scheduled) or a grid of people by day. Setup (on/off, locations,
 * schedules) is in Settings, under the ⋮ menu, which also opens Export
 * Timesheet.
 * Kept to the week so the people list, the most used part, comes first.
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
  // The week being looked at; null follows the current one.
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const viewWeek = pickedWeek ?? thisWeek;
  const isThisWeek = viewWeek === thisWeek;
  const [view, setView] = useState<GridView>('list');
  const headerScroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY)
      .then((saved) => {
        if (saved === 'week' || saved === 'list') setView(saved);
      })
      .catch(() => {});
  }, []);
  const chooseView = (next: GridView) => {
    setView(next);
    AsyncStorage.setItem(VIEW_KEY, next).catch(() => {});
  };
  const [teachers, setTeachers] = useState<OrgTeacher[]>([]);
  const [week, setWeek] = useState<Map<string, WeekSchedule>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  // Which week each listener last delivered, or null after an error.
  const [loaded, setLoaded] = useState<{ week: string | null; hours: string | null }>({ week: null, hours: null });
  const [now, setNow] = useState(() => Date.now());
  const [onShiftOpen, setOnShiftOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuAction = useRef(0);

  // A fresh key on each open, debounced: the same workaround as the class
  // screen's menu for react-native-paper's Menu not reopening.
  const openMenu = useCallback(() => {
    const t = Date.now();
    if (t - lastMenuAction.current < MENU_DEBOUNCE_MS) return;
    lastMenuAction.current = t;
    setMenuKey((k) => k + 1);
    setMenuVisible(true);
  }, []);
  const closeMenu = useCallback(() => {
    lastMenuAction.current = Date.now();
    setMenuVisible(false);
  }, []);

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
    return subscribeToOrgWeek(
      orgId,
      viewWeek,
      (w) => {
        setWeek(w);
        setLoaded((l) => ({ ...l, week: viewWeek }));
      },
      (err) => {
        console.error('Error loading the week:', err);
        setLoaded((l) => ({ ...l, week: null }));
        setMessage("Couldn't load this week's shifts.");
      }
    );
  }, [orgId, enabled, viewWeek]);

  useEffect(() => {
    if (!orgId || !enabled) return;
    return subscribeToOrgWeekEntries(
      orgId,
      viewWeek,
      (e) => {
        setEntries(e);
        setLoaded((l) => ({ ...l, hours: viewWeek }));
      },
      (err) => {
        console.error("Error loading the week's hours:", err);
        setLoaded((l) => ({ ...l, hours: null }));
        setMessage("Couldn't load this week's hours.");
      }
    );
  }, [orgId, enabled, viewWeek]);
  // Shown only once the week's shifts and hours have both
  // loaded, so worked shifts never read as zero or another week's.
  const weekReady = loaded.week === viewWeek && loaded.hours === viewWeek;

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
  // Who's on shift is about now, so only for the current week.
  const onShift = isThisWeek ? clockedInNow(entries, now) : [];
  const today = todayIn(timezone, new Date(now));
  const nameOf = (uid: string) => {
    const t = teachers.find((x) => x.uid === uid);
    return t ? `${t.firstName} ${t.lastName}` : 'Someone';
  };
  const people = teachers.map((t) => ({ uid: t.uid, name: `${t.firstName} ${t.lastName}` }));
  const columns = gridDates(weekDates(viewWeek), [...rowsByTeacher.values()].flat());
  const column = useGridColumn(columns.length);

  const openTeacher = (uid: string) => {
    router.push({
      pathname: '/(teacher)/organization/teacher/[teacherId]',
      params: { teacherId: uid, name: nameOf(uid), weekStart: viewWeek },
    });
  };

  // An empty day from today on adds a shift; a day with one opens it; a past
  // empty day, a busier day, or a shift removed after it was worked opens the
  // person's week (so a stray tap on the past adds nothing).
  const openCell = (uid: string, cell: GridCell) => {
    if (cell.rows.length === 0 && cell.date < today) {
      openTeacher(uid);
    } else if (cell.rows.length === 0) {
      router.push({ pathname: '/(teacher)/organization/shift', params: { teacherId: uid, weekStart: viewWeek, date: cell.date } });
    } else if (cell.rows.length === 1 && !cell.rows[0].removed) {
      router.push({
        pathname: '/(teacher)/organization/shift',
        params: { teacherId: uid, weekStart: viewWeek, shiftId: cell.rows[0].shiftId },
      });
    } else {
      openTeacher(uid);
    }
  };

  // Beyond the teachers of its classes: its admins, who can track their own
  // time without teaching, and anyone scheduled or with hours in the week
  // shown (say, removed from their last class mid-week), so no one's hours
  // are left out. A sorted string, so this changes with that set, not on
  // every snapshot.
  const extraKey = [
    ...new Set([...(selectedOrg?.memberUserIds ?? []), ...week.keys(), ...entries.map((e) => e.teacherId)]),
  ]
    .sort()
    .join(',');
  // Everyone already asked for, in which org: paging to another week fetches
  // only the people it brings in, not the whole organization again.
  const requested = useRef<{ orgId: string; uids: Set<string> } | null>(null);

  /** Everyone, from scratch: the first load and pull-to-refresh. */
  const loadAll = useCallback(async () => {
    if (!orgId) return;
    const extras = extraKey ? extraKey.split(',') : [];
    // Marked before the fetch, so a week arriving meanwhile only fetches who
    // this doesn't cover, and its people are merged in below, not dropped.
    const known = requested.current?.orgId === orgId ? requested.current.uids : new Set<string>();
    if (requested.current?.orgId !== orgId) setTeachers([]);
    extras.forEach((uid) => known.add(uid));
    requested.current = { orgId, uids: known };
    try {
      const all = await getOrgTeachers(orgId, extras);
      all.forEach((t) => known.add(t.uid));
      setTeachers((current) =>
        [...all, ...current.filter((c) => !all.some((t) => t.uid === c.uid) && known.has(c.uid))].sort(byName)
      );
    } catch (err) {
      requested.current = null; // the next change, or pull-to-refresh, tries everyone again
      console.error('Error loading organization teachers:', err);
      setMessage("Couldn't load teachers. Pull down to try again.");
    }
  }, [orgId, extraKey]);

  useEffect(() => {
    if (!enabled || !orgId) return;
    if (requested.current?.orgId !== orgId) {
      loadAll();
      return;
    }
    const known = requested.current.uids;
    const missing = (extraKey ? extraKey.split(',') : []).filter((uid) => !known.has(uid));
    if (missing.length === 0) return;
    missing.forEach((uid) => known.add(uid));
    getPeople(missing)
      .then((more) =>
        setTeachers((current) => [...current, ...more.filter((m) => !current.some((t) => t.uid === m.uid))].sort(byName))
      )
      .catch((err) => {
        console.error('Error loading people:', err);
        missing.forEach((uid) => known.delete(uid));
      });
  }, [enabled, orgId, extraKey, loadAll]);

  // What Timekeeping is for: a bottom sheet, by itself on this device's
  // first visit (once timekeeping is on), then from the help link.
  const openHelp = () => router.push('/(teacher)/organization/timekeeping-help');
  const helpChecked = useRef(false);
  useEffect(() => {
    if (!enabled || helpChecked.current) return;
    helpChecked.current = true;
    hasSeenHelp('timekeeping').then((seen) => {
      if (!seen) router.push('/(teacher)/organization/timekeeping-help');
    });
  }, [enabled]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const turnOn = async () => {
    if (!orgId || !user) return;
    setTurningOn(true);
    try {
      await setTimekeepingEnabled(orgId, true, user.uid);
    } catch (err) {
      console.error('Error turning on timekeeping:', err);
      setMessage("Couldn't turn on timekeeping. Please try again.");
    } finally {
      setTurningOn(false);
    }
  };

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Menu
            key={menuKey}
            visible={menuVisible}
            onDismiss={closeMenu}
            anchor={
              <IconButton
                icon="dots-vertical"
                iconColor="#fff"
                size={24}
                style={{ margin: 0 }}
                onPress={openMenu}
                accessibilityLabel="More"
              />
            }
          >
            <Menu.Item
              onPress={() => {
                closeMenu();
                router.push('/(teacher)/organization/timekeeping-settings');
              }}
              title="Settings"
              leadingIcon="cog-outline"
            />
            {enabled && (
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  router.push({ pathname: '/(teacher)/organization/timesheet-export', params: { weekStart: viewWeek } });
                }}
                title="Export timesheet"
                leadingIcon="file-pdf-box"
              />
            )}
          </Menu>
        ),
      }}
    />
  );

  if (!settingsLoaded) {
    return (
      <>
        {header}
        <LoadingSpinner />
      </>
    );
  }

  const locations = settings?.locations ?? [];
  const showGrid = locations.length > 0 && teachers.length > 0 && weekReady && view === 'week';

  if (!enabled) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {header}
        <View style={styles.off}>
          <Text variant="titleMedium" style={styles.offTitle}>
            Timekeeping is off
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            Turn it on to set weekly shifts for your teachers and let them start them at your school. You can turn it off
            again from Settings; nothing is lost.
          </Text>
          <Button onPress={turnOn} loading={turningOn} disabled={turningOn} style={styles.offButton}>
            Turn on timekeeping
          </Button>
        </View>
        <AppSnackbar message={message} onDismiss={() => setMessage(null)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {header}
      {/* Children are always the same four, so the grid's day header is
          always child 2 for stickyHeaderIndices (the ScrollView drops null
          children, which would shift the index). */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        stickyHeaderIndices={showGrid ? [2] : undefined}
      >
        <View style={styles.pager}>
          <IconButton
            icon="chevron-left"
            onPress={() => setPickedWeek(shiftWeek(viewWeek, -1))}
            accessibilityLabel="Previous week"
          />
          <Pressable
            onPress={() => setPickedWeek(null)}
            style={styles.weekLabel}
            accessibilityRole="button"
            accessibilityLabel={`Week of ${weekRangeLabel(viewWeek, new Date(now).getFullYear())}${isThisWeek ? ', this week' : '. Go to this week'}`}
          >
            <Text variant="titleMedium">{weekRangeLabel(viewWeek, new Date(now).getFullYear())}</Text>
            <Text variant="bodySmall" style={styles.muted}>
              {isThisWeek ? 'This week' : 'Tap for this week'}
            </Text>
          </Pressable>
          <IconButton
            icon="chevron-right"
            onPress={() => setPickedWeek(shiftWeek(viewWeek, 1))}
            accessibilityLabel="Next week"
          />
        </View>

        <View>
          {locations.length === 0 ? (
            <List.Item
              title="Add your school's location"
              description="Teachers have to be there to start a shift"
              left={(props) => <List.Icon {...props} icon="map-marker-plus" color="#1a73e8" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/(teacher)/organization/location')}
            />
          ) : (
            <>
              <SegmentedButtons
                value={view}
                onValueChange={(v) => chooseView(v as GridView)}
                buttons={[
                  { value: 'list', label: 'List', icon: 'format-list-bulleted' },
                  { value: 'week', label: 'Week', icon: 'calendar-week' },
                ]}
                style={styles.toggle}
              />
              {onShift.length > 0 && (
                <List.Item
                  title={`${onShift.length} on shift`}
                  description={stripNames(onShift.map((e) => nameOf(e.teacherId)))}
                  descriptionNumberOfLines={1}
                  left={(props) => <List.Icon {...props} icon="account-clock" color="#1e7e34" />}
                  right={(props) => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => setOnShiftOpen(true)}
                  style={styles.strip}
                />
              )}
            </>
          )}
          <HelpLink label="How timekeeping works" onPress={openHelp} />
          {locations.length > 0 && <Divider />}
        </View>

        <View>
          {showGrid && <WeekGridHeader dates={columns} today={today} column={column} scrollRef={headerScroll} />}
        </View>

        <View>
          {locations.length === 0 ? null : teachers.length === 0 ? (
            <Text variant="bodyMedium" style={styles.hint}>
              No classes are linked to {selectedOrg?.name ?? 'this organization'} yet.
            </Text>
          ) : !weekReady ? (
            <LoadingSpinner />
          ) : view === 'list' ? (
            <List.Section>
              <List.Subheader>Worked / scheduled</List.Subheader>
              {teachers.map((t) => (
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
                  onPress={() => openTeacher(t.uid)}
                />
              ))}
            </List.Section>
          ) : (
            <View style={styles.grid}>
              <WeekGrid
                people={people}
                rowsFor={rowsFor}
                dates={columns}
                today={today}
                column={column}
                onScrollX={(x) => headerScroll.current?.scrollTo({ x, animated: false })}
                onPressName={openTeacher}
                onPressCell={openCell}
              />
            </View>
          )}
        </View>

      </ScrollView>

      <Portal>
        <Dialog visible={onShiftOpen} onDismiss={() => setOnShiftOpen(false)}>
          <Dialog.Title>On shift now</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogList}>
            <ScrollView>
              {onShift.map((e) => {
                const since = rowsFor(e.teacherId).find((r) => r.shiftId === e.shiftId)?.workedFrom;
                return (
                  <List.Item
                    key={e.id}
                    title={nameOf(e.teacherId)}
                    description={[
                      e.status === 'paused' ? 'On break' : 'Working',
                      since ? `since ${formatTime(since)}` : '',
                      e.locationName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => {
                      setOnShiftOpen(false);
                      openTeacher(e.teacherId);
                    }}
                  />
                );
              })}
              {onShift.length === 0 && (
                <Text variant="bodyMedium" style={styles.hint}>
                  No one is on shift now.
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button mode="text" onPress={() => setOnShiftOpen(false)}>
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <AppSnackbar message={message} onDismiss={() => setMessage(null)} />
    </SafeAreaView>
  );
}

/** 'Sara Malik, Ali Khan +2' */
function stripNames(names: string[]): string {
  const shown = names.slice(0, STRIP_NAMES).join(', ');
  return names.length > STRIP_NAMES ? `${shown} +${names.length - STRIP_NAMES}` : shown;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  weekLabel: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toggle: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  strip: {
    backgroundColor: '#f1f8f3',
  },
  grid: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  hint: {
    color: '#666',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  muted: {
    color: '#666',
  },
  off: {
    padding: 24,
  },
  offTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  offButton: {
    marginTop: 24,
  },
  dialogList: {
    maxHeight: 360,
    paddingHorizontal: 0,
  },
});
