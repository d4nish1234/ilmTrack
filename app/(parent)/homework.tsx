import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, ScrollView } from 'react-native';
import { Text, Card, Chip, IconButton } from 'react-native-paper';
import { useNavigation } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { useChildFilter } from '../../src/contexts/ChildFilterContext';
import { Button, LoadingSpinner } from '../../src/components/common';
import { Student, Homework, HomeworkEvaluation, EVALUATION_LABELS } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getHomeworkPaginatedForParent } from '../../src/services/homework.service';
import { format } from 'date-fns';
import { colors, fontWeight, spacing, statusColor, typography } from '../../src/constants/theme';

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
            iconColor={star <= evaluation ? colors.star : colors.disabled}
            size={18}
            style={{ margin: 0, padding: 0 }}
          />
        ))}
      </View>
      <Text variant={typography.caption} style={evaluationStyles.label}>
        {EVALUATION_LABELS[evaluation]}
      </Text>
    </View>
  );
}

const evaluationStyles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
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
        getDoc(doc(firestore, 'students', id)).catch(() => null)
      )
    );

    return studentDocs
      .filter((docSnap) => docSnap?.exists())
      .map((docSnap) => ({ id: docSnap!.id, ...docSnap!.data() })) as Student[];
  }, [user?.studentIds]);

  const fetchHomework = useCallback(async (isLoadMore = false) => {
    if (!user?.uid) return;

    if (isLoadMore) {
      setLoadingMore(true);
    }

    try {
      const result = await getHomeworkPaginatedForParent(
        user.uid,
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
      await fetchHomework(false);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudents, checkForNewInvites, fetchHomework]);

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="refresh"
          iconColor={colors.onPrimary}
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

        // Fetch homework with pagination (using parentUserIds array-contains)
        if (user?.uid) {
          const result = await getHomeworkPaginatedForParent(user.uid, PAGE_SIZE, null);
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
  }, [user?.studentIds, user?.uid, fetchStudents]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchHomework(true);
    }
  }, [loadingMore, hasMore, fetchHomework]);

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };


  const renderHomework = ({ item }: { item: Homework }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant={typography.h4} style={styles.title}>
              {item.title}
            </Text>
            <Text variant={typography.caption} style={styles.studentName}>
              {getStudentName(item.studentId)}
            </Text>
            <Text variant={typography.caption} style={styles.date}>
              {item.createdAt ? format(item.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
            </Text>
          </View>
          <Chip
            compact
            style={{ backgroundColor: statusColor(item.status) }}
            textStyle={{ color: colors.onPrimary }}
          >
            {item.status}
          </Chip>
        </View>

        {item.description && (
          <Text variant={typography.body} style={styles.description}>
            {item.description}
          </Text>
        )}

        {item.dueDate && (
          <Text variant={typography.caption} style={styles.dueDate}>
            Due: {format(item.dueDate.toDate(), 'MMM d, yyyy')}
          </Text>
        )}

        {item.notes && (
          <Text variant={typography.caption} style={styles.notes}>
            Note: {item.notes}
          </Text>
        )}

        {item.evaluation && (
          <>
            <EvaluationDisplay evaluation={item.evaluation} />
            {item.evaluationNotes && (
              <Text variant={typography.caption} style={styles.evaluationNotes}>
                {item.evaluationNotes}
              </Text>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading homework..." />;
  }

  const emptyMessage = !user?.studentIds?.length
    ? 'No students linked to your account yet.'
    : selectedChildId
      ? 'No homework for this child yet.'
      : 'No homework assigned yet.';

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
        data={filteredHomework}
        renderItem={renderHomework}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filteredHomework.length > 0 ? styles.listContent : styles.emptyListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant={typography.body} style={styles.emptyText}>
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
          ) : undefined
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
  filterContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterScroll: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    marginRight: spacing.xs,
  },
  listContent: {
    padding: spacing.lg,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontWeight: fontWeight.semibold,
  },
  studentName: {
    color: colors.primary,
    marginTop: 2,
  },
  date: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    marginTop: spacing.md,
    color: colors.text,
  },
  dueDate: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  notes: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  evaluationNotes: {
    marginTop: 6,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
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
