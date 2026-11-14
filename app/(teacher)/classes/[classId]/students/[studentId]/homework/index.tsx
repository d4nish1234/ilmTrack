import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, FlatList, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Text, Card, Chip, FAB, Menu, IconButton, Portal, Modal, Divider, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getHomeworkPaginatedAsTeacher, updateHomework, deleteHomework } from '../../../../../../../src/services/homework.service';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import { Button, LoadingSpinner, Tappable } from '../../../../../../../src/components/common';
import { Homework, HomeworkStatus, HomeworkEvaluation, EVALUATION_LABELS } from '../../../../../../../src/types';
import { format } from 'date-fns';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { colors, fontSize, fontWeight, radius, spacing, statusColor, typography } from '../../../../../../../src/constants/theme';

// Star rating component
function StarRating({
  rating,
  onRatingChange,
  readonly = false,
}: {
  rating?: HomeworkEvaluation;
  onRatingChange?: (rating: HomeworkEvaluation) => void;
  readonly?: boolean;
}) {
  const stars = [1, 2, 3, 4, 5] as HomeworkEvaluation[];

  return (
    <View style={starStyles.container}>
      <View style={starStyles.starsRow}>
        {stars.map((star) => (
          <Tappable
            key={star}
            onPress={() => !readonly && onRatingChange?.(star)}
            disabled={readonly}
            style={starStyles.starButton}
          >
            <IconButton
              icon={rating && star <= rating ? 'star' : 'star-outline'}
              iconColor={rating && star <= rating ? colors.star : colors.disabled}
              size={readonly ? 16 : 32}
              style={{ margin: 0 }}
            />
          </Tappable>
        ))}
      </View>
      {rating && (
        <Text
          variant={readonly ? 'bodySmall' : 'bodyMedium'}
          style={[starStyles.label, readonly && starStyles.labelSmall]}
        >
          {EVALUATION_LABELS[rating]}
        </Text>
      )}
    </View>
  );
}

const starStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starButton: {
    padding: 0,
  },
  label: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  labelSmall: {
    marginTop: 2,
    fontSize: fontSize.xs,
  },
});

export default function HomeworkListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { user } = useAuth();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuActionRef = useRef(0);
  const [evaluationModalId, setEvaluationModalId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<HomeworkEvaluation | undefined>();
  const [evaluationComment, setEvaluationComment] = useState('');

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

  const fetchHomework = useCallback(async (isLoadMore = false) => {
    if (!studentId) return;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await getHomeworkPaginatedAsTeacher(
        studentId,
        user!.uid,
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
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, lastDoc]);

  useFocusEffect(
    useCallback(() => {
      fetchHomework(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId])
  );

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchHomework(true);
    }
  };

  const handleStatusChange = async (id: string, status: HomeworkStatus) => {
    closeMenu();
    try {
      await updateHomework(id, { status });
      // Update local state
      setHomework((prev) =>
        prev.map((h) => (h.id === id ? { ...h, status } : h))
      );
    } catch (error) {
      console.error('Error updating homework:', error);
    }
  };

  const handleEdit = (item: Homework) => {
    closeMenu();
    router.push(
      `/(teacher)/classes/${classId}/students/${studentId}/homework/edit?homeworkId=${item.id}`
    );
  };

  const handleDelete = async (id: string) => {
    closeMenu();
    try {
      await deleteHomework(id);
      setHomework((prev) => prev.filter((h) => h.id !== id));
    } catch (error) {
      console.error('Error deleting homework:', error);
    }
  };

  const openEvaluationModal = (item: Homework) => {
    closeMenu();
    setSelectedRating(item.evaluation);
    setEvaluationComment(item.evaluationNotes || '');
    setEvaluationModalId(item.id);
  };

  const handleSaveEvaluation = async () => {
    if (!evaluationModalId || !selectedRating) return;
    try {
      const comment = evaluationComment.trim();
      await updateHomework(evaluationModalId, { evaluation: selectedRating, evaluationNotes: comment });
      // Update local state
      setHomework((prev) =>
        prev.map((h) =>
          h.id === evaluationModalId
            ? { ...h, evaluation: selectedRating, evaluationNotes: comment || undefined }
            : h
        )
      );
    } catch (error) {
      console.error('Error updating evaluation:', error);
    }
    setEvaluationModalId(null);
    setSelectedRating(undefined);
    setEvaluationComment('');
  };


  const renderHomework = ({ item }: { item: Homework }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant={typography.h4} style={styles.title}>
              {item.title}
            </Text>
            <Text variant={typography.caption} style={styles.date}>
              {item.createdAt ? format(item.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
            </Text>
          </View>
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
              title="Edit Homework"
              onPress={() => handleEdit(item)}
              leadingIcon="pencil"
            />
            <Menu.Item
                title={item.evaluation ? 'Edit Evaluation' : 'Add Evaluation'}
                onPress={() => openEvaluationModal(item)}
                leadingIcon="star"
              />
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
            <Divider />
            <Menu.Item
              title="Delete"
              onPress={() => handleDelete(item.id)}
              leadingIcon="delete"
              titleStyle={{ color: colors.danger }}
            />
          </Menu>
        </View>

        {item.description && (
          <Text variant={typography.body} style={styles.description}>
            {item.description}
          </Text>
        )}

        <View style={styles.footer}>
          <Chip
            compact
            style={{ backgroundColor: statusColor(item.status) }}
            textStyle={{ color: colors.onPrimary }}
          >
            {item.status}
          </Chip>
          {item.dueDate && (
            <Text variant={typography.caption} style={styles.dueDate}>
              Due: {format(item.dueDate.toDate(), 'MMM d, yyyy')}
            </Text>
          )}
        </View>

        {item.notes && (
          <Text variant={typography.caption} style={styles.notes}>
            Note: {item.notes}
          </Text>
        )}

        {item.evaluation && (
          <View style={styles.evaluationContainer}>
            <StarRating rating={item.evaluation} readonly />
            {item.evaluationNotes && (
              <Text variant={typography.caption} style={styles.evaluationNotes}>
                {item.evaluationNotes}
              </Text>
            )}
          </View>
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
            No homework assigned yet
          </Text>
        </View>
      )}

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/(teacher)/classes/add-homework',
            params: { classId, studentId },
          })
        }
      />

      {/* Evaluation Modal */}
      <Portal>
        <Modal
          visible={!!evaluationModalId}
          onDismiss={Keyboard.dismiss}
          dismissable={false}
          contentContainerStyle={styles.modalContainer}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
              <Text variant={typography.h3} style={styles.modalTitle}>
                Evaluate Homework
              </Text>
              <Text variant={typography.body} style={styles.modalSubtitle}>
                How did the student do?
              </Text>

              <StarRating rating={selectedRating} onRatingChange={setSelectedRating} />

              <TextInput
                label="Comment (optional)"
                value={evaluationComment}
                onChangeText={setEvaluationComment}
                mode="outlined"
                style={styles.commentInput}
                multiline
                numberOfLines={2}
              />

              <View style={styles.modalActions}>
                <Tappable
                  style={[styles.modalButton, styles.saveButton, !selectedRating && styles.disabledButton]}
                  onPress={handleSaveEvaluation}
                  disabled={!selectedRating}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </Tappable>
                <Tappable
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setEvaluationModalId(null);
                    setSelectedRating(undefined);
                    setEvaluationComment('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Tappable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </Portal>
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
    backgroundColor: colors.background,
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
    fontWeight: fontWeight.semibold,
  },
  date: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    marginTop: spacing.sm,
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  dueDate: {
    color: colors.textSecondary,
  },
  evaluationContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  evaluationNotes: {
    marginTop: 6,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  notes: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
  modalContainer: {
    backgroundColor: colors.background,
    margin: 20,
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  modalTitle: {
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  commentInput: {
    marginTop: spacing.lg,
    backgroundColor: colors.background,
  },
  modalActions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  modalButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  disabledButton: {
    backgroundColor: colors.border,
  },
  saveButtonText: {
    color: colors.onPrimary,
    fontWeight: fontWeight.semibold,
  },
  cancelButton: {
    backgroundColor: colors.surface,
  },
  cancelButtonText: {
    color: colors.textSecondary,
  },
});
