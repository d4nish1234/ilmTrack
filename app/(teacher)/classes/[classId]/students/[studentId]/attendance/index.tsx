import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip, FAB, Menu, IconButton, Divider, Button } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { getAttendancePaginated, updateAttendance, deleteAttendance, PaginatedResult } from '../../../../../../../src/services/attendance.service';
import { LoadingSpinner } from '../../../../../../../src/components/common';
import { Attendance, AttendanceStatus } from '../../../../../../../src/types';
import { format } from 'date-fns';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

export default function AttendanceListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuActionRef = useRef(0);

  const PAGE_SIZE = 10;

  // Menu handlers - increment key on open to force fresh Menu state
  const MENU_DEBOUNCE_MS = 300;

  const openMenu = useCallback((id: string) => {
    const now = Date.now();
    if (now - lastMenuActionRef.current < MENU_DEBOUNCE_MS) {
      return;
    }
    lastMenuActionRef.current = now;
    setMenuKey((k) => k + 1);
    setMenuId(id);
  }, []);

  const closeMenu = useCallback(() => {
    lastMenuActionRef.current = Date.now();
    setMenuId(null);
  }, []);

  const fetchAttendance = useCallback(async (isLoadMore = false) => {
    if (!studentId) return;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await getAttendancePaginated(
        studentId,
        PAGE_SIZE,
        isLoadMore ? lastDoc : null
      );

      if (isLoadMore) {
        setAttendance((prev) => [...prev, ...result.data]);
      } else {
        setAttendance(result.data);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [studentId, lastDoc]);

  useEffect(() => {
    fetchAttendance(false);
  }, [studentId]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchAttendance(true);
    }
  };

  const handleStatusChange = async (id: string, status: AttendanceStatus) => {
    closeMenu();
    try {
      await updateAttendance(id, { status });
      // Update local state
      setAttendance((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
  };

  const handleDelete = async (id: string) => {
    closeMenu();
    try {
      await deleteAttendance(id);
      // Update local state
      setAttendance((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error('Error deleting attendance:', error);
    }
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
              key={menuId === item.id ? menuKey : undefined}
              visible={menuId === item.id}
              onDismiss={closeMenu}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={20}
                  onPress={() => openMenu(item.id)}
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
              <Divider />
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
          ListFooterComponent={
            hasMore ? (
              <Button
                mode="outlined"
                onPress={handleLoadMore}
                loading={loadingMore}
                disabled={loadingMore}
                style={styles.loadMoreButton}
              >
                Load More
              </Button>
            ) : null
          }
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
  loadMoreButton: {
    marginTop: 8,
    marginBottom: 16,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1a73e8',
  },
});
