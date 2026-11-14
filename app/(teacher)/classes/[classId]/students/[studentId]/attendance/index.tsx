import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip, Menu, IconButton, Divider } from 'react-native-paper';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getAttendancePaginatedAsTeacher, updateAttendance, deleteAttendance } from '../../../../../../../src/services/attendance.service';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import { AddButton, Button, LoadingSpinner } from '../../../../../../../src/components/common';
import { Attendance, AttendanceStatus } from '../../../../../../../src/types';
import { format } from 'date-fns';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { colors, spacing, statusColor, typography } from '../../../../../../../src/constants/theme';

export default function AttendanceListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { user } = useAuth();
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
      const result = await getAttendancePaginatedAsTeacher(
        studentId,
        user!.uid,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, lastDoc]);

  useFocusEffect(
    useCallback(() => {
      fetchAttendance(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId])
  );

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


  const renderAttendance = ({ item }: { item: Attendance }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text variant={typography.h4}>
              {item.date ? format(item.date.toDate(), 'EEEE, MMMM d, yyyy') : 'Today'}
            </Text>
            {item.notes && (
              <Text variant={typography.caption} style={styles.notes}>
                {item.notes}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <Chip
              compact
              style={{ backgroundColor: statusColor(item.status) }}
              textStyle={{ color: colors.onPrimary }}
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
                titleStyle={{ color: colors.danger }}
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
            ) : undefined
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Text variant={typography.body} style={styles.emptyText}>
            No attendance records yet
          </Text>
        </View>
      )}

      <AddButton
        accessibilityLabel="Add attendance"
        onPress={() =>
          router.push({
            pathname: '/(teacher)/classes/add-attendance',
            params: { classId, studentId },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.card,
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
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
    color: colors.textSecondary,
  },
  loadMoreButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
