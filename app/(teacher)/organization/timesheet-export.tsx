import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Chip, Divider, List, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { byName, getOrgTeachers, getPeople } from '../../../src/services/organization.service';
import { getOrgWeeks, getTeacherWeeks, subscribeToTimekeeping } from '../../../src/services/timekeeping.service';
import { sharePdf } from '../../../src/services/export.service';
import { AppSnackbar, Button } from '../../../src/components/common';
import { DateField } from '../../../src/components/timekeeping/DateField';
import { openPeoplePicker } from '../../../src/components/timekeeping/peoplePicker';
import type { OrgTeacher, Shift, TimeEntry, TimekeepingSettings } from '../../../src/types';
import { endAfterStartMoves } from '../../../src/utils/scheduleTemplates';
import { peopleSummary, type PickablePerson } from '../../../src/utils/peoplePicker';
import { todayIn } from '../../../src/utils/timekeeping';
import { timesheetRows } from '../../../src/utils/timesheet';
import {
  RANGE_PRESETS,
  matchingPreset,
  pdfFileName,
  presetRange,
  rangeProblem,
  rangeWeeks,
  readChosenOnly,
  rowsInRange,
  timesheetHtml,
  weekRange,
  type DateRange,
  type ExportPerson,
} from '../../../src/utils/timesheetExport';
import { colors, typography } from '../../../src/constants/theme';

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const fullName = (t: OrgTeacher) => `${t.firstName} ${t.lastName}`;

/**
 * Export a timesheet PDF: who (everyone, or people chosen on the next screen)
 * and which dates. Opened from the Timekeeping screen's ⋮ menu, starting on
 * the week that was being looked at, or from one person's week with them
 * already chosen. Reads the weeks once, when exporting; nothing is stored.
 */
export default function TimesheetExportScreen() {
  const { weekStart, teacherId, name } = useLocalSearchParams<{
    weekStart?: string;
    /** From one person's week: start with just them chosen. */
    teacherId?: string;
    name?: string;
  }>();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;
  const [settings, setSettings] = useState<TimekeepingSettings | null>(null);
  // The export waits for these: without them every shift's location would
  // read "Location removed" and times would be in the phone's timezone.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [teachers, setTeachers] = useState<OrgTeacher[] | null>(null);
  const [range, setRange] = useState<DateRange>(() =>
    weekStart && WEEK_RE.test(weekStart) ? weekRange(weekStart) : presetRange('this-week', todayIn(null))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [people, setPeople] = useState<PickablePerson[]>([]);
  // null is everyone; opened from one person's week, just them.
  const [chosen, setChosen] = useState<string[] | null>(() => (teacherId ? [teacherId] : null));

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setSettings(s);
        setSettingsLoaded(true);
      },
      (err) => {
        console.error('Error loading timekeeping settings:', err);
        setMessage("Couldn't load timekeeping settings. Go back and try again.");
      }
    );
  }, [orgId]);

  // Reloaded when the organization's admins change; who is chosen is kept.
  const memberKey = (selectedOrg?.memberUserIds ?? []).join(',');
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getOrgTeachers(orgId, memberKey ? memberKey.split(',') : [])
      .then((all) => {
        if (cancelled) return;
        const sorted = [...all].sort(byName);
        setTeachers(sorted);
        const list = sorted.map((t) => ({ uid: t.uid, name: fullName(t) }));
        // Opened from the week of someone no longer in a class: still choosable.
        if (teacherId && !list.some((p) => p.uid === teacherId)) {
          list.push({ uid: teacherId, name: name || 'Former member' });
          list.sort((a, b) => a.name.localeCompare(b.name));
        }
        setPeople(list);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error loading organization teachers:', err);
        setTeachers([]);
        setMessage("Couldn't load the people in this organization.");
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, memberKey, teacherId, name]);

  const timezone = settings?.timezone ?? deviceTimezone();
  const today = todayIn(settings?.timezone);
  const problem = rangeProblem(range);
  const preset = matchingPreset(range, today);
  const locationNames = useMemo(
    () => new Map((settings?.locations ?? []).map((l) => [l.id, l.name])),
    [settings?.locations]
  );

  const chosenNames =
    chosen === null ? null : chosen.map((uid) => people.find((p) => p.uid === uid)?.name ?? 'Someone');

  const exportPdf = async () => {
    if (!orgId || problem) return;
    setBusy(true);
    try {
      const weeks = rangeWeeks(range);
      const { schedules, entries } =
        chosen && readChosenOnly(chosen.length, people.length)
          ? await getTeacherWeeks(orgId, chosen, weeks)
          : await getOrgWeeks(orgId, weeks);
      const shiftsBy = new Map<string, Shift[]>();
      for (const s of schedules) shiftsBy.set(s.teacherId, [...(shiftsBy.get(s.teacherId) ?? []), ...s.shifts]);
      const entriesBy = new Map<string, TimeEntry[]>();
      for (const e of entries) entriesBy.set(e.teacherId, [...(entriesBy.get(e.teacherId) ?? []), e]);

      // Everyone also takes in whoever has shifts or hours in these dates but
      // isn't in the list any more (they left a class or the organization).
      const uids = chosen ?? [...new Set([...people.map((p) => p.uid), ...shiftsBy.keys(), ...entriesBy.keys()])];
      const known = new Map((teachers ?? []).map((t) => [t.uid, t]));
      const missing = uids.filter((uid) => !known.has(uid));
      if (missing.length) (await getPeople(missing)).forEach((t) => known.set(t.uid, t));

      const now = Date.now();
      const exported: ExportPerson[] = uids
        .map((uid) => {
          const t = known.get(uid);
          return {
            teacher: { uid, name: t ? fullName(t) : 'Former member', email: t?.email ?? '' },
            rows: rowsInRange(
              timesheetRows(shiftsBy.get(uid) ?? [], entriesBy.get(uid) ?? [], locationNames, timezone, now),
              range
            ),
          };
        })
        // People chosen by name are listed even with nothing to show; for
        // everyone, only those with shifts.
        .filter((p) => chosen !== null || p.rows.length > 0)
        .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));

      if (exported.length === 0) {
        setMessage('No one had shifts in these dates.');
        return;
      }

      const orgName = selectedOrg?.name ?? '';
      const html = timesheetHtml({
        orgName,
        range,
        timezone,
        people: exported,
        preparedAt: format(new Date(now), 'MMM d, yyyy, h:mm a'),
      });
      await sharePdf(pdfFileName(orgName, range), html);
    } catch (err) {
      console.error('Error exporting timesheet:', err);
      setMessage("Couldn't export the timesheet. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <List.Section>
          <List.Subheader>People</List.Subheader>
          <List.Item
            title={peopleSummary(chosenNames)}
            description={
              teachers === null
                ? 'Loading…'
                : chosen === null
                  ? 'Anyone with shifts in these dates'
                  : `${chosen.length} of ${people.length} chosen`
            }
            left={(props) => <List.Icon {...props} icon="account-multiple-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => openPeoplePicker({ people, chosen, everyoneOption: true, onDone: setChosen })}
            disabled={teachers === null || people.length === 0}
          />
        </List.Section>
        <Divider />

        <List.Section>
          <List.Subheader>Dates</List.Subheader>
          <View style={styles.body}>
            <View style={styles.chips}>
              {RANGE_PRESETS.map(({ key, label }) => (
                <Chip
                  key={key}
                  selected={preset === key}
                  showSelectedOverlay
                  onPress={() => setRange(presetRange(key, today))}
                  style={styles.chip}
                  accessibilityLabel={`${label}${preset === key ? ', selected' : ''}`}
                >
                  {label}
                </Chip>
              ))}
            </View>
            <View style={styles.row}>
              <Text variant={typography.bodyLarge}>From</Text>
              <DateField
                value={range.from}
                onChange={(from) => setRange({ from, to: endAfterStartMoves(range.from, from, range.to) })}
              />
            </View>
            <View style={styles.row}>
              <Text variant={typography.bodyLarge}>To</Text>
              <DateField value={range.to} onChange={(to) => setRange({ ...range, to })} minimumDate={range.from} />
            </View>
            {problem && (
              <Text variant={typography.body} style={styles.error}>
                {problem}
              </Text>
            )}
          </View>
        </List.Section>
        <Divider />

        <Text variant={typography.caption} style={styles.hint}>
          A PDF with everyone&apos;s hours at the top, then each person&apos;s shifts: scheduled and worked times, and
          any notes or admin edits. Times are in {timezone}.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button icon="file-pdf-box" onPress={exportPdf} loading={busy} disabled={!!problem || teachers === null || !settingsLoaded}>
          Export PDF
        </Button>
      </View>

      <AppSnackbar message={message} onDismiss={() => setMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 24,
  },
  body: {
    paddingHorizontal: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  error: {
    color: colors.danger,
    marginTop: 8,
  },
  hint: {
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  footer: {
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
