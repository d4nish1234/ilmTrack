import React, { useState } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { List, Divider, Text, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useOrganizations } from '../../../src/contexts/OrganizationContext';
import { LoadingSpinner } from '../../../src/components/common';

/**
 * The organization's tools. A plain list so more can be added as rows.
 * Only reachable by people who administer an organization; the tab is hidden
 * for everyone else.
 */
export default function OrganizationScreen() {
  const { user } = useAuth();
  const { organizations, selectedOrg, selectOrg, loading } = useOrganizations();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (loading) return <LoadingSpinner />;

  if (!selectedOrg) {
    return (
      <SafeAreaView style={styles.empty} edges={['bottom']}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          You don’t manage any organization.
        </Text>
      </SafeAreaView>
    );
  }

  const myRole = selectedOrg.members.find((m) => m.userId === user?.uid)?.role;
  const canSwitch = organizations.length > 1;

  const header = (
    <List.Item
      title={selectedOrg.name}
      titleStyle={styles.orgName}
      description={myRole === 'owner' ? 'Owner' : 'Admin'}
      left={(props) => <List.Icon {...props} icon="office-building" />}
      right={canSwitch ? (props) => <List.Icon {...props} icon="swap-horizontal" /> : undefined}
      onPress={canSwitch ? () => setSwitcherOpen(true) : undefined}
      style={styles.header}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        {canSwitch ? (
          <Menu
            visible={switcherOpen}
            onDismiss={() => setSwitcherOpen(false)}
            anchor={header}
            anchorPosition="bottom"
          >
            {organizations.map((org) => (
              <Menu.Item
                key={org.id}
                title={org.name}
                leadingIcon={org.id === selectedOrg.id ? 'check' : undefined}
                onPress={() => {
                  setSwitcherOpen(false);
                  selectOrg(org.id);
                }}
              />
            ))}
          </Menu>
        ) : (
          header
        )}

        <Divider />

        <List.Section>
          <List.Subheader>Tools</List.Subheader>
          <List.Item
            title="Timekeeping"
            description="Shifts and hours for your teachers"
            left={(props) => <List.Icon {...props} icon="timer-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/(teacher)/organization/timekeeping')}
          />
        </List.Section>

        {canSwitch && (
          <View style={styles.footer}>
            <Text variant="bodySmall" style={styles.footerText}>
              Switching organization only changes this tab. Your Classes tab always shows the
              classes you teach.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
  },
  orgName: {
    fontWeight: '600',
    fontSize: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
  },
  footerText: {
    color: '#888',
  },
});
