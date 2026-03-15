import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, ScrollView } from 'react-native';
import { Text, Card, Chip, Button, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../src/contexts/AuthContext';
import { useChildFilter } from '../../src/contexts/ChildFilterContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Attendance } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getAttendancePaginatedForParent } from '../../src/services/attendance.service';
import { format } from 'date-fns';

// Deduplicate students by name (same child in multiple classes)
function deduplicateStudentsByName(students: Student[]): Student[] {
  const seen = new Map<string, Student>();
  for (const student of students) {
    const key = `${student.firstName.toLowerCase()}-${student.lastName.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, student);
    }
  }
  return Array.from(seen.values());
}

// Get all student IDs for a given unique child (handles same child in multiple classes)
function getStudentIdsForChild(students: Student[], childId: string): string[] {
  const targetStudent = students.find(s => s.id === childId);
  if (!targetStudent) return [childId];

  return students
    .filter(s =>
      s.firstName.toLowerCase() === targetStudent.firstName.toLowerCase() &&
      s.lastName.toLowerCase() === targetStudent.lastName.toLowerCase()
    )
    .map(s => s.id);
}

export default function ParentAttendanceScreen() {
  const { user, checkForNewInvites } = useAuth();
  const { selectedChildId, setSelectedChildId } = useChildFilter();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 10;

  // Get unique children (deduplicated by name)
  const uniqueChildren = useMemo(() => deduplicateStudentsByName(students), [students]);
  const showFilter = uniqueChildren.length > 1;

  // Filter attendance based on selected child
  const filteredAttendance = useMemo(() => {
    if (!selectedChildId) return attendance; // Show all
    const childStudentIds = getStudentIdsForChild(students, selectedChildId);
    return attendance.filter(a => childStudentIds.includes(a.studentId));
  }, [attendance, selectedChildId, students]);

  const fetchStudents = useCallback(async () => {
    if (!user?.studentIds?.length) return [];

    const studentDocs = await Promise.all(
      user.studentIds!.map((id) =>
        getDoc(doc(firestore, 'students', id)).catch(() => null)
      )
    );

    return studentDocs
      .filter((docSnap) => docSnap?.exists())
      .map((docSnap) => ({ id: docSnap!.id, ...docSnap!.data() })) as Student[];
  }, [user?.studentIds]);

  const fetchAttendance = useCallback(async (isLoadMore = false) => {
    if (!user?.uid) return;

    if (isLoadMore) {
      setLoadingMore(true);
    }

    try {
      const result = await getAttendancePaginatedForParent(
        user.uid,
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
      setLoadingMore(false);
    }
  }, [lastDoc, user?.uid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Check for new invites (auto-links new students if found)
      await checkForNewInvites();
      const studentList = await fetchStudents();
      setStudents(studentList);
      // Reset pagination and refetch
      setLastDoc(null);
      setHasMore(false);
      await fetchAttendance(false);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudents, checkForNewInvites, fetchAttendance]);

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="refresh"
          iconColor="#fff"
          size={24}
          onPress={onRefresh}
          disabled={refreshing}
        />
      ),
    });
  }, [navigation, onRefresh, refreshing]);

  useEffect(() => {
    if (!user?.studentIds?.length) {
      setLoading(false);
      setStudents([]);
      setAttendance([]);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        // Fetch students
        const studentList = await fetchStudents();
        if (!isMounted) return;
        setStudents(studentList);

        // Fetch attendance with pagination (using parentUserIds array-contains)
        if (user?.uid) {
          const result = await getAttendancePaginatedForParent(user.uid, PAGE_SIZE, null);
          if (!isMounted) return;
          setAttendance(result.data);
          setLastDoc(result.lastDoc);
          setHasMore(result.hasMore);
        }
        setLoading(false);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error:', error);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [user?.studentIds, user?.uid, fetchStudents]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchAttendance(true);
    }
  }, [loadingMore, hasMore, fetchAttendance]);

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };

  const getStatusColor = (status: string) => {
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
            <Text variant="bodySmall" style={styles.studentName}>
              {getStudentName(item.studentId)}
            </Text>
            {item.notes && (
              <Text variant="bodySmall" style={styles.notes}>
                {item.notes}
              </Text>
            )}
          </View>
          <Chip
            compact
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: '#fff' }}
          >
            {item.status}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading attendance..." />;
  }

  const emptyMessage = !user?.studentIds?.length
    ? 'No students linked to your account yet.'
    : selectedChildId
      ? 'No attendance records for this child yet.'
      : 'No attendance records yet.';

  return (
    <View style={styles.container}>
      {showFilter && (
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <Chip
              selected={selectedChildId === null}
              onPress={() => setSelectedChildId(null)}
              style={styles.filterChip}
              mode="outlined"
            >
              All Children
            </Chip>
            {uniqueChildren.map((child) => (
              <Chip
                key={child.id}
                selected={selectedChildId === child.id}
                onPress={() => setSelectedChildId(child.id)}
                style={styles.filterChip}
                mode="outlined"
              >
                {child.firstName}
              </Chip>
            ))}
          </ScrollView>
        </View>
      )}
      <FlatList
        data={filteredAttendance}
        renderItem={renderAttendance}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filteredAttendance.length > 0 ? styles.listContent : styles.emptyListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {emptyMessage}
            </Text>
          </View>
        }
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  filterContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    marginRight: 4,
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  studentName: {
    color: '#1a73e8',
    marginTop: 4,
  },
  notes: {
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyContainer: {
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
});
