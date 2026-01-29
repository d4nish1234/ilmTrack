import React from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { Text, Card, FAB } from 'react-native-paper';
import { router } from 'expo-router';
import { useClasses } from '../../../src/hooks/useClasses';
import { LoadingSpinner } from '../../../src/components/common';
import { Class } from '../../../src/types';

export default function ClassesListScreen() {
  const { classes, loading } = useClasses();

  const handleClassPress = (classItem: Class) => {
    router.push(`/(teacher)/classes/${classItem.id}`);
  };

  const renderClass = ({ item }: { item: Class }) => (
    <TouchableOpacity onPress={() => handleClassPress(item)}>
      <Card style={styles.classCard}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.className}>
            {item.name}
          </Text>
          {item.description && (
            <Text variant="bodyMedium" style={styles.description}>
              {item.description}
            </Text>
          )}
          <Text variant="bodySmall" style={styles.studentCount}>
            {item.studentCount} student{item.studentCount !== 1 ? 's' : ''}
          </Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return <LoadingSpinner message="Loading classes..." />;
  }

  return (
    <View style={styles.container}>
      {classes.length > 0 ? (
        <FlatList
          data={classes}
          renderItem={renderClass}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            No classes yet
          </Text>
          <Text variant="bodyMedium" style={styles.emptyMessage}>
            Create your first class to start adding students
          </Text>
        </View>
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/(teacher)/classes/create')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  classCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  className: {
    fontWeight: '600',
  },
  description: {
    color: '#666',
    marginTop: 4,
  },
  studentCount: {
    color: '#1a73e8',
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#666',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1a73e8',
  },
});
