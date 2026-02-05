import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, ScrollView } from 'react-native';
import { Text, Card, Chip, IconButton, Button } from 'react-native-paper';
import { useAuth } from '../../src/contexts/AuthContext';
import { useChildFilter } from '../../src/contexts/ChildFilterContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Homework, HomeworkEvaluation, EVALUATION_LABELS } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getHomeworkPaginatedMultiStudent } from '../../src/services/homework.service';
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

// Star display component for parent view
function EvaluationDisplay({ evaluation }: { evaluation: HomeworkEvaluation }) {
  const stars = [1, 2, 3, 4, 5] as HomeworkEvaluation[];

  return (
    <View style={evaluationStyles.container}>
      <View style={evaluationStyles.starsRow}>
        {stars.map((star) => (
          <IconButton
            key={star}
            icon={star <= evaluation ? 'star' : 'star-outline'}
            iconColor={star <= evaluation ? '#ffc107' : '#ddd'}
            size={18}
            style={{ margin: 0, padding: 0 }}
          />
        ))}
      </View>
      <Text variant="bodySmall" style={evaluationStyles.label}>
        {EVALUATION_LABELS[evaluation]}
      </Text>
    </View>
  );
}

const evaluationStyles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    color: '#666',
    fontWeight: '500',
    marginTop: 2,
  },
});

export default function ParentHomeworkScreen() {
  const { user, checkForNewInvites } = useAuth();
  const { selectedChildId, setSelectedChildId } = useChildFilter();
  const [students, setStudents] = useState<Student[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 10;

  // Get unique children (deduplicated by name)
  const uniqueChildren = useMemo(() => deduplicateStudentsByName(students), [students]);
  const showFilter = uniqueChildren.length > 1;

  // Filter homework based on selected child
  const filteredHomework = useMemo(() => {
    if (!selectedChildId) return homework; // Show all
    const childStudentIds = getStudentIdsForChild(students, selectedChildId);
    return homework.filter(h => childStudentIds.includes(h.studentId));
  }, [homework, selectedChildId, students]);

  const fetchStudents = useCallback(async () => {
    if (!user?.studentIds?.length) return [];

    const studentDocs = await Promise.all(
      user.studentIds!.map((id) =>
        getDoc(doc(firestore, 'students', id))
      )
    );

    return studentDocs
      .filter((docSnap) => docSnap.exists())
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Student[];
  }, [user?.studentIds]);

  const fetchHomework = useCallback(async (studentIds: string[], isLoadMore = false) => {
    if (studentIds.length === 0) return;

    if (isLoadMore) {
      setLoadingMore(true);
    }

    try {
      const result = await getHomeworkPaginatedMultiStudent(
        studentIds,
        PAGE_SIZE,
        isLoadMore ? lastDoc : null
      );

      if (isLoadMore) {
        setHomework((prev) => [...prev, ...result.data]);
      } else {
        setHomework(result.data);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error fetching homework:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [lastDoc]);

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
      if (studentList.length > 0) {
        const studentIds = studentList.map((s) => s.id);
        await fetchHomework(studentIds, false);
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudents, checkForNewInvites, fetchHomework]);

  useEffect(() => {
    if (!user?.studentIds?.length) {
      setLoading(false);
      setStudents([]);
      setHomework([]);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        // Fetch students
        const studentList = await fetchStudents();
        if (!isMounted) return;
        setStudents(studentList);

        // Fetch homework with pagination
        if (studentList.length > 0) {
          const studentIds = studentList.map((s) => s.id);
          const result = await getHomeworkPaginatedMultiStudent(studentIds, PAGE_SIZE, null);
          if (!isMounted) return;
          setHomework(result.data);
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
  }, [user?.studentIds, fetchStudents]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && students.length > 0) {
      const studentIds = students.map((s) => s.id);
      fetchHomework(studentIds, true);
    }
  }, [loadingMore, hasMore, students, fetchHomework]);

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };

  const getStatusColor = (status: string) => {
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
            <Text variant="bodySmall" style={styles.studentName}>
              {getStudentName(item.studentId)}
            </Text>
            <Text variant="bodySmall" style={styles.date}>
              {item.createdAt ? format(item.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
            </Text>
          </View>
          <Chip
            compact
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: '#fff' }}
          >
            {item.status}
          </Chip>
        </View>

        {item.description && (
          <Text variant="bodyMedium" style={styles.description}>
            {item.description}
          </Text>
        )}

        {item.dueDate && (
          <Text variant="bodySmall" style={styles.dueDate}>
            Due: {format(item.dueDate.toDate(), 'MMM d, yyyy')}
          </Text>
        )}

        {item.evaluation && <EvaluationDisplay evaluation={item.evaluation} />}

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

  if (!user?.studentIds?.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodyMedium" style={styles.emptyText}>
          No students linked to your account yet.
        </Text>
      </View>
    );
  }

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
      {filteredHomework.length > 0 ? (
        <FlatList
          data={filteredHomework}
          renderItem={renderHomework}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
      ) : (
        <View style={styles.emptyContainer}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            {selectedChildId ? 'No homework for this child yet.' : 'No homework assigned yet.'}
          </Text>
        </View>
      )}
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
    marginRight: 8,
  },
  title: {
    fontWeight: '600',
  },
  studentName: {
    color: '#1a73e8',
    marginTop: 2,
  },
  date: {
    color: '#666',
    marginTop: 2,
  },
  description: {
    marginTop: 12,
    color: '#444',
  },
  dueDate: {
    marginTop: 8,
    color: '#666',
  },
  notes: {
    marginTop: 8,
    color: '#666',
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
