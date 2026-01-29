import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip, FAB, Menu, IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { subscribeToHomework, updateHomework, deleteHomework } from '../../../../../../../src/services/homework.service';
import { LoadingSpinner } from '../../../../../../../src/components/common';
import { Homework, HomeworkStatus } from '../../../../../../../src/types';
import { format } from 'date-fns';

export default function HomeworkListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;

    const unsubscribe = subscribeToHomework(
      studentId,
      (data) => {
        setHomework(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching homework:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [studentId]);

  const handleStatusChange = async (id: string, status: HomeworkStatus) => {
    try {
      await updateHomework(id, { status });
    } catch (error) {
      console.error('Error updating homework:', error);
    }
    setMenuId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHomework(id);
    } catch (error) {
      console.error('Error deleting homework:', error);
    }
    setMenuId(null);
  };

  const getStatusColor = (status: HomeworkStatus) => {
    switch (status) {
      case 'completed':
        return '#4caf50';
      case 'incomplete':
        return '#f44336';
      case 'late':
        return '#ff9800';
      default:
        return '#2196f3';
    }
  };

  const renderHomework = ({ item }: { item: Homework }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant="titleMedium" style={styles.title}>
              {item.title}
            </Text>
            <Text variant="bodySmall" style={styles.date}>
              {format(item.createdAt.toDate(), 'MMM d, yyyy')}
            </Text>
          </View>
          <Menu
            visible={menuId === item.id}
            onDismiss={() => setMenuId(null)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={20}
                onPress={() => setMenuId(item.id)}
              />
            }
          >
            <Menu.Item
              title="Mark Completed"
              onPress={() => handleStatusChange(item.id, 'completed')}
              leadingIcon="check"
            />
            <Menu.Item
              title="Mark Incomplete"
              onPress={() => handleStatusChange(item.id, 'incomplete')}
              leadingIcon="close"
            />
            <Menu.Item
              title="Mark Late"
              onPress={() => handleStatusChange(item.id, 'late')}
              leadingIcon="clock-alert"
            />
            <Menu.Item
              title="Delete"
              onPress={() => handleDelete(item.id)}
              leadingIcon="delete"
              titleStyle={{ color: '#d32f2f' }}
            />
          </Menu>
        </View>

        {item.description && (
          <Text variant="bodyMedium" style={styles.description}>
            {item.description}
          </Text>
        )}

        <View style={styles.footer}>
          <Chip
            compact
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: '#fff' }}
          >
            {item.status}
          </Chip>
          {item.dueDate && (
            <Text variant="bodySmall" style={styles.dueDate}>
              Due: {format(item.dueDate.toDate(), 'MMM d, yyyy')}
            </Text>
          )}
        </View>

        {item.notes && (
          <Text variant="bodySmall" style={styles.notes}>
            Note: {item.notes}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading homework..." />;
  }

  return (
    <View style={styles.container}>
      {homework.length > 0 ? (
        <FlatList
          data={homework}
          renderItem={renderHomework}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No homework assigned yet
          </Text>
        </View>
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() =>
          router.push(
            `/(teacher)/classes/${classId}/students/${studentId}/homework/add`
          )
        }
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
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  date: {
    color: '#666',
    marginTop: 2,
  },
  description: {
    marginTop: 8,
    color: '#444',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  dueDate: {
    color: '#666',
  },
  notes: {
    marginTop: 8,
    color: '#666',
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1a73e8',
  },
});
