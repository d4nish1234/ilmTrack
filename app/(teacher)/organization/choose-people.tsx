import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Checkbox, Divider, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/common';
import { peoplePickerRequest } from '../../../src/components/timekeeping/peoplePicker';
import { filterPeople, pickResult } from '../../../src/utils/peoplePicker';
import { colors, spacing, typography } from '../../../src/constants/theme';

/**
 * Choose People, shared by every screen that picks people (opened with
 * openPeoplePicker): a filter box, tick boxes, Select all (of the people the
 * filter shows), and Continue to hand the choice back. Back discards changes. The tab bar is hidden here
 * ((teacher)/_layout.tsx) so Continue sits at the bottom.
 */
export default function ChoosePeopleScreen() {
  // Read once: the list and the starting ticks come from the screen that opened this.
  const [request] = useState(peoplePickerRequest);
  const people = [...(request?.people ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(request?.chosen ?? request?.people.map((p) => p.uid) ?? [])
  );
  const [search, setSearch] = useState('');

  const shown = filterPeople(people, search);
  const tickedCount = people.filter((p) => ticked.has(p.uid)).length;
  const allTicked = people.length > 0 && tickedCount === people.length;
  const filtering = search.trim() !== '';
  // Select all / Clear act on the people the filter shows, so typing a name
  // and tapping Select all ticks just the matches.
  const allShownTicked = shown.length > 0 && shown.every((p) => ticked.has(p.uid));
  const setShown = (on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      shown.forEach((p) => (on ? next.add(p.uid) : next.delete(p.uid)));
      return next;
    });

  const toggle = (uid: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const done = () => {
    if (!request) return;
    request.onDone(pickResult(people, ticked, request.everyoneOption));
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text variant={typography.h5} style={styles.count}>
          {allTicked ? `Everyone · ${people.length}` : `${tickedCount} of ${people.length} chosen`}
        </Text>
        {shown.length > 1 && (
          <Button mode="text" onPress={() => setShown(!allShownTicked)}>
            {allShownTicked ? (filtering ? 'Clear these' : 'Clear') : filtering ? 'Select these' : 'Select all'}
          </Button>
        )}
      </View>
      {people.length > 1 && (
        <Searchbar
          placeholder="Filter by name"
          value={search}
          onChangeText={setSearch}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />
      )}
      <FlatList
        data={shown}
        keyExtractor={(p) => p.uid}
        ItemSeparatorComponent={Divider}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Checkbox.Item
            label={item.name}
            status={ticked.has(item.uid) ? 'checked' : 'unchecked'}
            onPress={() => toggle(item.uid)}
            position="leading"
            labelStyle={styles.label}
          />
        )}
        ListEmptyComponent={
          <Text variant={typography.body} style={styles.empty}>
            {search.trim()
              ? 'No one matches.'
              : "No one to choose yet. People appear here once they teach one of the organization's classes."}
          </Text>
        }
      />
      <View style={styles.footer}>
        <Button onPress={done} disabled={!request || tickedCount === 0}>
          {tickedCount === 0 ? 'Choose at least one person' : 'Continue'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: 52,
  },
  count: {
    color: colors.textSecondary,
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  label: {
    textAlign: 'left',
  },
  empty: {
    color: colors.textSecondary,
    padding: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
