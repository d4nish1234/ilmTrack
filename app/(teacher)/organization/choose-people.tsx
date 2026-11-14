import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Checkbox, Divider, Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/common';
import { peoplePickerRequest } from '../../../src/components/timekeeping/peoplePicker';
import { filterPeople, pickResult } from '../../../src/utils/peoplePicker';

/** Show a search box once the list is longer than this. */
const SEARCH_FROM = 8;

/**
 * Choose People, shared by every screen that picks people (opened with
 * openPeoplePicker): tick boxes, Select all, search, and Continue to hand the
 * choice back. Back discards changes. The tab bar is hidden here
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
        <Text variant="titleSmall" style={styles.count}>
          {allTicked ? `Everyone · ${people.length}` : `${tickedCount} of ${people.length} chosen`}
        </Text>
        {people.length > 1 && (
          <Button mode="text" onPress={() => setTicked(allTicked ? new Set() : new Set(people.map((p) => p.uid)))}>
            {allTicked ? 'Clear' : 'Select all'}
          </Button>
        )}
      </View>
      {people.length > SEARCH_FROM && (
        <Searchbar placeholder="Search people" value={search} onChangeText={setSearch} style={styles.search} />
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
          <Text variant="bodyMedium" style={styles.empty}>
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 52,
  },
  count: {
    color: '#666',
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  label: {
    textAlign: 'left',
  },
  empty: {
    color: '#666',
    padding: 16,
  },
  footer: {
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
});
