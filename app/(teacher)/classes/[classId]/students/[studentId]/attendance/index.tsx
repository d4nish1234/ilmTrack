import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip, FAB, Menu, IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { subscribeToAttendance, updateAttendance, deleteAttendance } from '../../../../../../../src/services/attendance.service';
import { LoadingSpinner } from '../../../../../../../src/components/common';
import { Attendance, AttendanceStatus } from '../../../../../../../src/types';
import { format } from 'date-fns';

export default function AttendanceListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;

    const unsubscribe = subscribeToAttendance(
      studentId,
      (data) => {
        setAttendance(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching attendance:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [studentId]);

  const handleStatusChange = async (id: string, status: AttendanceStatus) => {
    try {
      await updateAttendance(id, { status });
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
    setMenuId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAttendance(id);
    } catch (error) {
      console.error('Error deleting attendance:', error);
    }
    setMenuId(null);
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return '#4caf50';
      case 'absent':
        return '#f44336';
      case 'late':
        return '#ff9800';
      case 'excused':
        return '#2196f3';
      default:
        return '#666';
    }
  };

  const renderAttendance = ({ item }: { item: Attendance }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text variant="titleMedium">
              {item.date ? format(item.date.toDate(), 'EEEE, MMMM d, yyyy') : 'Today'}
            </Text>
            {item.notes && (
              <Text variant="bodySmall" style={styles.notes}>
                {item.notes}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <Chip
              compact
              style={{ backgroundColor: getStatusColor(item.status) }}
              textStyle={{ color: '#fff' }}
            >
              {item.status}
            </Chip>

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
                title="Present"
                onPress={() => handleStatusChange(item.id, 'present')}
                leadingIcon="check"
              />
              <Menu.Item
                title="Absent"
                onPress={() => handleStatusChange(item.id, 'absent')}
                leadingIcon="close"
              />
              <Menu.Item
                title="Late"
                onPress={() => handleStatusChange(item.id, 'late')}
                leadingIcon="clock-alert"
              />
              <Menu.Item
                title="Excused"
                onPress={() => handleStatusChange(item.id, 'excused')}
                leadingIcon="account-check"
              />
              <Menu.Item
                title="Delete"
                onPress={() => handleDelete(item.id)}
                leadingIcon="delete"
                titleStyle={{ color: '#d32f2f' }}
              />
            </Menu>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading attendance..." />;
  }

  return (
    <View style={styles.container}>
      {attendance.length > 0 ? (
        <FlatList
          data={attendance}
          renderItem={renderAttendance}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No attendance records yet
          </Text>
        </View>
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() =>
          router.push(
            `/(teacher)/classes/${classId}/students/${studentId}/attendance/add`
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  notes: {
    color: '#666',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
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
