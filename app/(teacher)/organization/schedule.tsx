import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Card, Chip, List, Text } from 'react-native-paper';
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
import { Button, LoadingSpinner, useUnsavedChanges } from '../../../src/components/common';
import { DateField } from '../../../src/components/timekeeping/DateField';
import { TimeField } from '../../../src/components/timekeeping/TimeField';
import { openPeoplePicker } from '../../../src/components/timekeeping/peoplePicker';
import type {
  OrgTeacher,
  ScheduleTemplate,
  TemplateApplyResult,
  TemplateSlot,
  TimekeepingLocation,
} from '../../../src/types';
import { errorMessage, formatDuration, shiftMinutes, todayIn } from '../../../src/utils/timekeeping';
import { peopleSummary } from '../../../src/utils/peoplePicker';
import {
  TEMPLATE_SLOTS_MAX,
  WEEKDAYS,
  changeSummary,
  endAfterStartMoves,
  skippedLines,
  templateChanged,
  templateName,
  templateProblem,
} from '../../../src/utils/scheduleTemplates';
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
 *
 * Follows the edit-screen pattern (app/(teacher)/CLAUDE.md): no tab bar, Save
 * pinned to the bottom and shown only once something has changed, no Cancel
 * (back asks Keep editing / Discard / Save when there are changes), Delete at the end of
 * the form. Schedules have no name on
 * screen; templateName makes the one the server needs.
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
  const [edits, setEdits] = useState<{
    draft: TemplateDraft;
    version: number | null;
  } | null>(null);
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
  const initial = useMemo((): {
    draft: TemplateDraft;
    version: number | null;
  } | null => {
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
  // Something to save: Save appears only then.
  // Saved or deleted: nothing left to save, and the screen goes back (below).
  const [done, setDone] = useState(false);
  const changed = !done && !!edits && (!initial || templateChanged(edits.draft, initial.draft));
  // Deleted before the admin changed anything; once they have, saving says so.
  const missing = stored === 'missing' && !edits;

  const nameOf = useMemo(() => {
    const names = new Map((teachers ?? []).map((t) => [t.uid, `${t.firstName} ${t.lastName}`]));
    return (uid: string) => names.get(uid) ?? 'Someone no longer in the organization';
  }, [teachers]);

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
    ? ({ create: false, expectedUpdatedAt: current?.version ?? null } as const)
    : ({ create: true } as const);
  const locationIds = locations?.map((l) => l.id) ?? [];
  const problem = draft && locations ? templateProblem(draft, locationIds) : null;

  // Defined before the screen's early returns, because the unsaved-changes
  // guard below (a hook) needs it: Save there runs this same preview.
  const save =
    draft && orgId && !problem && !busy
      ? () => {
          // The server needs a name; the app makes it rather than asking.
          const toSave = { ...draft, name: templateName(draft) };
          const apply = () =>
            run(async () => {
              await saveScheduleTemplate(orgId, toSave, false, version);
              setDone(true);
            }, "Couldn't save the schedule. Check your connection and try again.");
          return run(async () => {
            const preview = await saveScheduleTemplate(orgId, toSave, true, version);
            Alert.alert(
              templateId ? 'Apply changes?' : 'Apply schedule?',
              describe(
                preview,
                'Shifts that have started or already happened, and days changed by hand, stay as they are.'
              ),
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Apply', onPress: apply },
              ]
            );
          }, "Couldn't check the schedule. Check your connection and try again.");
        }
      : undefined;
  // Leaving with changes asks first: Keep editing, Discard, or Save (which previews, applies, then leaves).
  const unsaved = useUnsavedChanges(changed, save);
  // Back once saved or deleted; after the render that turned the guard off.
  useEffect(() => {
    if (done) router.back();
  }, [done]);

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

  const update = (change: Partial<TemplateDraft>) =>
    setEdits({ draft: { ...draft, ...change }, version: current!.version });
  const updateSlot = (id: string, change: Partial<TemplateSlot>) =>
    update({
      slots: draft.slots.map((s) => (s.id === id ? { ...s, ...change } : s)),
    });

  // Everyone who can be picked, plus anyone on the template who has since left
  // the organization, so they can be taken off it.
  const known = new Set(teachers.map((t) => t.uid));
  const people = [
    ...teachers.map((t) => ({
      uid: t.uid,
      name: `${t.firstName} ${t.lastName}`,
    })),
    ...draft.teacherIds.filter((uid) => !known.has(uid)).map((uid) => ({ uid, name: nameOf(uid) })),
  ];
  // The picker's answer arrives after this render, so it builds on whatever
  // the edits are by then.
  const choosePeople = () => {
    const version = current!.version;
    const before = draft;
    openPeoplePicker({
      people,
      chosen: draft.teacherIds,
      everyoneOption: false,
      onDone: (ids) =>
        setEdits((prev) => ({
          draft: { ...(prev?.draft ?? before), teacherIds: ids ?? [] },
          version: prev?.version ?? version,
        })),
    });
  };

  const remove = () =>
    run(async () => {
      const preview = await deleteScheduleTemplate(orgId, templateId!, true);
      Alert.alert(
        'Delete this schedule?',
        describe(preview, 'Shifts that have started or already happened are kept, with their hours.'),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              run(async () => {
                await deleteScheduleTemplate(orgId, templateId!, false);
                setDone(true);
              }, "Couldn't delete the schedule. Check your connection and try again."),
          },
        ]
      );
    }, "Couldn't check the schedule. Check your connection and try again.");

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title, headerLeft: unsaved.headerLeft }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleMedium" style={[styles.heading, styles.first]}>
          Dates
        </Text>
        <View style={styles.row}>
          <Text variant="bodyLarge">Starts</Text>
          <DateField
            value={draft.startDate}
            onChange={(startDate) =>
              update({
                startDate,
                endDate: endAfterStartMoves(draft.startDate, startDate, draft.endDate),
              })
            }
          />
        </View>
        <View style={styles.row}>
          <Text variant="bodyLarge">Ends</Text>
          <DateField value={draft.endDate} onChange={(endDate) => update({ endDate })} minimumDate={draft.startDate} />
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
                <Button
                  mode="text"
                  textColor="#d32f2f"
                  onPress={() =>
                    update({
                      slots: draft.slots.filter((s) => s.id !== slot.id),
                    })
                  }
                >
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
              update({
                slots: [...draft.slots, newSlot(locations[0]?.id ?? '', draft.slots[draft.slots.length - 1])],
              })
            }
          >
            Add another time
          </Button>
        )}

        <Text variant="titleMedium" style={styles.heading}>
          People
        </Text>
        <List.Item
          title={peopleSummary(draft.teacherIds.map(nameOf), people.length)}
          description={draft.teacherIds.length === 0 ? 'Who works these shifts' : undefined}
          left={(props) => <List.Icon {...props} icon="account-multiple-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={choosePeople}
          disabled={people.length === 0}
          style={styles.people}
        />
        {people.length === 0 && (
          <Text variant="bodyMedium" style={styles.muted}>
            No one to choose yet. People appear here once they teach one of the organization&apos;s classes.
          </Text>
        )}

        <Text variant="bodySmall" style={[styles.muted, styles.gap]}>
          Applies from today. Shifts that have started or already happened, and days you change by hand in
          someone&apos;s week, stay as they are.
        </Text>

        {error && !changed && (
          <Text variant="bodyMedium" style={styles.error}>
            {error}
          </Text>
        )}

        {templateId && (
          <Button mode="outlined" textColor="#d32f2f" onPress={remove} disabled={busy} style={styles.delete}>
            Delete schedule
          </Button>
        )}
      </ScrollView>

      {changed && (
        <View style={styles.footer}>
          {(problem || error) && (
            <Text variant="bodyMedium" style={styles.footerError}>
              {problem ?? error}
            </Text>
          )}
          <Button onPress={() => save?.()} loading={busy} disabled={!save}>
            {templateId ? 'Save and apply' : 'Apply schedule'}
          </Button>
        </View>
      )}
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
  first: {
    marginTop: 0,
  },
  people: {
    paddingLeft: 0,
    marginLeft: -8,
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
  delete: {
    marginTop: 24,
  },
  footer: {
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  footerError: {
    color: '#d32f2f',
    paddingTop: 10,
  },
});
