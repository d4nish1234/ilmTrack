import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Card, Checkbox, Chip, Divider, Searchbar, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addWeeks, format, parseISO } from 'date-fns';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { getOrgTeachers } from '../../../src/services/organization.service';
import {
  deleteScheduleTemplate,
  newId,
  saveScheduleTemplate,
  subscribeToScheduleTemplates,
  subscribeToTimekeeping,
  type TemplateDraft,
} from '../../../src/services/timekeeping.service';
import { Button, LoadingSpinner } from '../../../src/components/common';
import { DateField } from '../../../src/components/timekeeping/DateField';
import { TimeField } from '../../../src/components/timekeeping/TimeField';
import type { OrgTeacher, ScheduleTemplate, TemplateApplyResult, TemplateSlot, TimekeepingLocation } from '../../../src/types';
import { errorMessage, formatDuration, shiftMinutes, todayIn } from '../../../src/utils/timekeeping';
import {
  TEMPLATE_NAME_MAX,
  TEMPLATE_SLOTS_MAX,
  WEEKDAYS,
  changeSummary,
  endAfterStartMoves,
  skippedLines,
  templateProblem,
} from '../../../src/utils/scheduleTemplates';

/** Show a search box once the list of people is longer than this. */
const SEARCH_FROM = 8;
/** People listed in the preview's "Not added" part. */
const PREVIEW_PEOPLE_MAX = 5;

const newSlot = (locationId: string, like?: TemplateSlot): TemplateSlot => ({
  id: newId(),
  days: like ? [...like.days] : [1, 2, 3, 4, 5],
  start: like?.start ?? '16:00',
  end: like?.end ?? '18:00',
  locationId: like?.locationId ?? locationId,
});

/**
 * Create or edit a schedule template: the same shifts for many people over a
 * term. Saving shows what will change first (a dry run of
 * saveScheduleTemplate), then writes it into everyone's weeks.
 */
export default function ScheduleTemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const orgId = selectedOrg?.id;

  const [locations, setLocations] = useState<TimekeepingLocation[] | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<OrgTeacher[] | null>(null);
  // The template being edited, live; 'missing' once it's gone.
  const [stored, setStored] = useState<ScheduleTemplate | 'missing' | null>(null);
  // A new template's id, made now so a retried save changes the same one.
  const [newTemplateId] = useState(newId);
  // What the admin has changed, with the version they started from. Until
  // they change something, the form follows the stored template.
  const [edits, setEdits] = useState<{ draft: TemplateDraft; version: number | null } | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    return subscribeToTimekeeping(
      orgId,
      (s) => {
        setLocations(s?.locations ?? []);
        setTimezone(s?.timezone ?? null);
      },
      (err) => console.error('Error loading locations:', err)
    );
  }, [orgId]);

  const adminKey = (selectedOrg?.memberUserIds ?? []).join(',');
  useEffect(() => {
    if (!orgId) return;
    getOrgTeachers(orgId, adminKey ? adminKey.split(',') : [])
      .then(setTeachers)
      .catch((err) => {
        console.error('Error loading teachers:', err);
        setTeachers([]);
        setError("Couldn't load the people in this organization.");
      });
  }, [orgId, adminKey]);

  useEffect(() => {
    if (!orgId || !templateId) return;
    return subscribeToScheduleTemplates(
      orgId,
      (templates) => setStored(templates.find((x) => x.id === templateId) ?? 'missing'),
      (err) => console.error('Error loading schedule:', err)
    );
  }, [orgId, templateId]);

  /** The form before any change: a new template, or the stored one and its version. */
  const initial = useMemo((): { draft: TemplateDraft; version: number | null } | null => {
    if (!locations) return null;
    if (!templateId) {
      const today = todayIn(timezone);
      return {
        draft: {
          id: newTemplateId,
          name: '',
          startDate: today,
          endDate: format(addWeeks(parseISO(today), 12), 'yyyy-MM-dd'),
          slots: [newSlot(locations[0]?.id ?? '')],
          teacherIds: [],
        },
        version: null,
      };
    }
    if (!stored || stored === 'missing') return null;
    return {
      draft: {
        id: stored.id,
        name: stored.name,
        startDate: stored.startDate,
        endDate: stored.endDate,
        slots: stored.slots,
        teacherIds: stored.teacherIds,
      },
      version: stored.updatedAt?.toMillis() ?? null,
    };
  }, [locations, templateId, timezone, newTemplateId, stored]);
  const current = edits ?? initial;
  const draft = current?.draft ?? null;
  // Deleted before the admin changed anything; once they have, saving says so.
  const missing = stored === 'missing' && !edits;

  const nameOf = useMemo(() => {
    const names = new Map((teachers ?? []).map((t) => [t.uid, `${t.firstName} ${t.lastName}`]));
    return (uid: string) => names.get(uid) ?? 'Someone no longer in the organization';
  }, [teachers]);

  const title = templateId ? 'Edit Schedule' : 'New Schedule';

  if (missing) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title }} />
        <View style={styles.content}>
          <Text variant="bodyLarge" style={styles.muted}>
            This schedule no longer exists. Someone may have just deleted it.
          </Text>
          <Button mode="outlined" onPress={() => router.back()} style={styles.gap}>
            Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!orgId || !user || !draft || !locations || !teachers) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <LoadingSpinner />
      </>
    );
  }

  const locationIds = locations.map((l) => l.id);
  const problem = templateProblem(draft, locationIds);
  const update = (change: Partial<TemplateDraft>) =>
    setEdits({ draft: { ...draft, ...change }, version: current!.version });
  const updateSlot = (id: string, change: Partial<TemplateSlot>) =>
    update({ slots: draft.slots.map((s) => (s.id === id ? { ...s, ...change } : s)) });

  // Everyone who can be picked, plus anyone on the template who has since left
  // the organization, so they can be taken off it.
  const known = new Set(teachers.map((t) => t.uid));
  const people = [
    ...teachers.map((t) => ({ uid: t.uid, name: `${t.firstName} ${t.lastName}` })),
    ...draft.teacherIds.filter((uid) => !known.has(uid)).map((uid) => ({ uid, name: nameOf(uid) })),
  ];
  const query = search.trim().toLowerCase();
  const shown = query ? people.filter((p) => p.name.toLowerCase().includes(query)) : people;
  const chosen = new Set(draft.teacherIds);
  const allChosen = people.length > 0 && people.every((p) => chosen.has(p.uid));
  const toggle = (uid: string) =>
    update({ teacherIds: chosen.has(uid) ? draft.teacherIds.filter((id) => id !== uid) : [...draft.teacherIds, uid] });

  /** The preview's message: what changes, and any days that won't be added. */
  const describe = (r: TemplateApplyResult, footer: string) => {
    const skipped = skippedLines(r, nameOf);
    // A dialog, so only the first few people; the counts above are complete.
    const shown = skipped.slice(0, PREVIEW_PEOPLE_MAX);
    const more = skipped.length - shown.length;
    return [
      changeSummary(r),
      shown.length
        ? `\nNot added:\n${shown.join('\n')}${more > 0 ? `\n…and ${more} more ${more === 1 ? 'person' : 'people'}` : ''}`
        : '',
      `\n${footer}`,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const version = templateId
    ? ({ create: false, expectedUpdatedAt: current!.version } as const)
    : ({ create: true } as const);

  const apply = () =>
    run(async () => {
      await saveScheduleTemplate(orgId, draft, false, version);
      router.back();
    }, "Couldn't save the schedule. Check your connection and try again.");

  const save = () =>
    run(async () => {
      const preview = await saveScheduleTemplate(orgId, draft, true, version);
      Alert.alert(
        templateId ? 'Apply changes?' : 'Apply schedule?',
        describe(preview, 'Shifts that have started or already happened, and days changed by hand, stay as they are.'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Apply', onPress: apply },
        ]
      );
    }, "Couldn't check the schedule. Check your connection and try again.");

  const remove = () =>
    run(async () => {
      const preview = await deleteScheduleTemplate(orgId, templateId!, true);
      Alert.alert(
        `Delete “${draft.name}”?`,
        describe(preview, 'Shifts that have started or already happened are kept, with their hours.'),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              run(async () => {
                await deleteScheduleTemplate(orgId, templateId!, false);
                router.back();
              }, "Couldn't delete the schedule. Check your connection and try again."),
          },
        ]
      );
    }, "Couldn't check the schedule. Check your connection and try again.");

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={16}>
        <TextInput
          label="Name"
          placeholder="e.g. Term 1"
          value={draft.name}
          onChangeText={(name) => update({ name })}
          mode="outlined"
          maxLength={TEMPLATE_NAME_MAX}
          style={styles.input}
        />

        <Text variant="titleMedium" style={styles.heading}>
          Dates
        </Text>
        <View style={styles.row}>
          <Text variant="bodyLarge">Starts</Text>
          <DateField
            value={draft.startDate}
            onChange={(startDate) =>
              update({ startDate, endDate: endAfterStartMoves(draft.startDate, startDate, draft.endDate) })
            }
          />
        </View>
        <View style={styles.row}>
          <Text variant="bodyLarge">Ends</Text>
          <DateField
            value={draft.endDate}
            onChange={(endDate) => update({ endDate })}
            minimumDate={draft.startDate}
          />
        </View>

        <Text variant="titleMedium" style={styles.heading}>
          Times
        </Text>
        {draft.slots.map((slot) => (
          <Card key={slot.id} mode="outlined" style={styles.slot}>
            <Card.Content>
              <View style={styles.days}>
                {WEEKDAYS.map((label, i) => {
                  const day = i + 1;
                  const on = slot.days.includes(day);
                  return (
                    <Chip
                      key={label}
                      compact
                      selected={on}
                      showSelectedOverlay
                      showSelectedCheck={false}
                      onPress={() =>
                        updateSlot(slot.id, {
                          days: on ? slot.days.filter((d) => d !== day) : [...slot.days, day].sort((a, b) => a - b),
                        })
                      }
                      style={styles.day}
                      accessibilityLabel={`${label}${on ? ', selected' : ''}`}
                    >
                      {label}
                    </Chip>
                  );
                })}
              </View>
              <View style={styles.row}>
                <Text variant="bodyLarge">From</Text>
                <TimeField value={slot.start} onChange={(start) => updateSlot(slot.id, { start })} />
              </View>
              <View style={styles.row}>
                <Text variant="bodyLarge">To</Text>
                <TimeField value={slot.end} onChange={(end) => updateSlot(slot.id, { end })} />
              </View>
              <Text variant="bodySmall" style={styles.muted}>
                {formatDuration(Math.max(0, shiftMinutes(slot)))} a day
              </Text>
              {(locations.length > 1 || !locationIds.includes(slot.locationId)) && (
                <View style={styles.chips}>
                  {locations.map((l) => (
                    <Chip
                      key={l.id}
                      selected={l.id === slot.locationId}
                      showSelectedOverlay
                      onPress={() => updateSlot(slot.id, { locationId: l.id })}
                      style={styles.chip}
                    >
                      {l.name}
                    </Chip>
                  ))}
                </View>
              )}
            </Card.Content>
            {draft.slots.length > 1 && (
              <Card.Actions>
                <Button mode="text" textColor="#d32f2f" onPress={() => update({ slots: draft.slots.filter((s) => s.id !== slot.id) })}>
                  Remove time
                </Button>
              </Card.Actions>
            )}
          </Card>
        ))}
        {draft.slots.length < TEMPLATE_SLOTS_MAX && (
          <Button
            mode="text"
            icon="plus"
            onPress={() =>
              update({ slots: [...draft.slots, newSlot(locations[0]?.id ?? '', draft.slots[draft.slots.length - 1])] })
            }
          >
            Add another time
          </Button>
        )}

        <View style={styles.peopleHeader}>
          <Text variant="titleMedium" style={styles.heading}>
            People · {draft.teacherIds.length} chosen
          </Text>
          {people.length > 1 && (
            <Button
              mode="text"
              onPress={() => update({ teacherIds: allChosen ? [] : people.map((p) => p.uid) })}
            >
              {allChosen ? 'Clear' : 'Select all'}
            </Button>
          )}
        </View>
        {people.length > SEARCH_FROM && (
          <Searchbar placeholder="Search people" value={search} onChangeText={setSearch} style={styles.search} />
        )}
        {people.length === 0 ? (
          <Text variant="bodyMedium" style={styles.muted}>
            No one to choose yet. People appear here once they teach one of the organization&apos;s classes.
          </Text>
        ) : (
          shown.map((p, i) => (
            <View key={p.uid}>
              {i > 0 && <Divider />}
              <Checkbox.Item
                label={p.name}
                status={chosen.has(p.uid) ? 'checked' : 'unchecked'}
                onPress={() => toggle(p.uid)}
                position="leading"
                labelStyle={styles.personLabel}
              />
            </View>
          ))
        )}

        <Text variant="bodySmall" style={[styles.muted, styles.gap]}>
          Applies from today. Shifts that have started or already happened, and days you change by hand in someone&apos;s
          week, stay as they are.
        </Text>

        {(error || problem) && (
          <Text variant="bodyMedium" style={styles.error}>
            {error ?? problem}
          </Text>
        )}

        <View style={styles.actions}>
          <Button onPress={save} loading={busy} disabled={busy || !!problem}>
            {templateId ? 'Save and apply' : 'Apply schedule'}
          </Button>
          {templateId && (
            <Button mode="outlined" textColor="#d32f2f" onPress={remove} disabled={busy}>
              Delete schedule
            </Button>
          )}
          <Button mode="text" onPress={() => router.back()} disabled={busy}>
            Cancel
          </Button>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  input: {
    backgroundColor: '#fff',
  },
  heading: {
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  slot: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  day: {
    minWidth: 44,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  peopleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  search: {
    marginBottom: 8,
  },
  personLabel: {
    textAlign: 'left',
  },
  muted: {
    color: '#666',
  },
  gap: {
    marginTop: 16,
  },
  error: {
    color: '#d32f2f',
    marginTop: 12,
  },
  actions: {
    marginTop: 16,
  },
});
