import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, RefreshControl, View } from 'react-native';
import { List, Text, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { getOrgTeachers } from '../../../src/services/organization.service';
import { LoadingSpinner } from '../../../src/components/common';
import type { OrgTeacher } from '../../../src/types';

/**
 * Timekeeping for the selected organization. For now this lists the
 * organization's teachers — the people shifts will be set for. The on/off
 * switch, locations and weekly shifts come next.
 */
export default function TimekeepingScreen() {
  const { selectedOrg } = useOrganizations();
  const [teachers, setTeachers] = useState<OrgTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = selectedOrg?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setTeachers(await getOrgTeachers(orgId));
      setError(null);
    } catch (err) {
      console.error('Error loading organization teachers:', err);
      setError("Couldn't load teachers. Pull down to try again.");
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={teachers}
        keyExtractor={(t) => t.uid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={<List.Subheader>Teachers</List.Subheader>}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => (
          <List.Item
            title={`${item.firstName} ${item.lastName}`}
            description={item.classNames.join(', ')}
            descriptionNumberOfLines={1}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {error ?? `No classes are linked to ${selectedOrg?.name ?? 'this organization'} yet.`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
});
