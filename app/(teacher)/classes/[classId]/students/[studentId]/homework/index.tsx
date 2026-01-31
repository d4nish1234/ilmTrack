import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { Text, Card, Chip, FAB, Menu, IconButton, Portal, Modal } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { subscribeToHomework, updateHomework, deleteHomework } from '../../../../../../../src/services/homework.service';
import { LoadingSpinner } from '../../../../../../../src/components/common';
import { Homework, HomeworkStatus, HomeworkEvaluation, EVALUATION_LABELS } from '../../../../../../../src/types';
import { format } from 'date-fns';

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
          <TouchableOpacity
            key={star}
            onPress={() => !readonly && onRatingChange?.(star)}
            disabled={readonly}
            style={starStyles.starButton}
          >
            <IconButton
              icon={rating && star <= rating ? 'star' : 'star-outline'}
              iconColor={rating && star <= rating ? '#ffc107' : '#ccc'}
              size={readonly ? 16 : 32}
              style={{ margin: 0 }}
            />
          </TouchableOpacity>
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
    marginTop: 8,
    color: '#666',
    fontWeight: '500',
  },
  labelSmall: {
    marginTop: 2,
    fontSize: 11,
  },
});

export default function HomeworkListScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [evaluationModalId, setEvaluationModalId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<HomeworkEvaluation | undefined>();

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

  const openEvaluationModal = (item: Homework) => {
    setSelectedRating(item.evaluation);
    setEvaluationModalId(item.id);
    setMenuId(null);
  };

  const handleSaveEvaluation = async () => {
    if (!evaluationModalId || !selectedRating) return;
    try {
      await updateHomework(evaluationModalId, { evaluation: selectedRating });
    } catch (error) {
      console.error('Error updating evaluation:', error);
    }
    setEvaluationModalId(null);
    setSelectedRating(undefined);
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
              {item.createdAt ? format(item.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
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
              title="Add Evaluation"
              onPress={() => openEvaluationModal(item)}
              leadingIcon="star"
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

        {item.evaluation && (
          <View style={styles.evaluationContainer}>
            <StarRating rating={item.evaluation} readonly />
          </View>
        )}

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

      {/* Evaluation Modal */}
      <Portal>
        <Modal
          visible={!!evaluationModalId}
          onDismiss={() => {
            setEvaluationModalId(null);
            setSelectedRating(undefined);
          }}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            Evaluate Homework
          </Text>
          <Text variant="bodyMedium" style={styles.modalSubtitle}>
            How did the student do?
          </Text>

          <StarRating rating={selectedRating} onRatingChange={setSelectedRating} />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, !selectedRating && styles.disabledButton]}
              onPress={handleSaveEvaluation}
              disabled={!selectedRating}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setEvaluationModalId(null);
                setSelectedRating(undefined);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>
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
  evaluationContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
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
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalActions: {
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#1a73e8',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
  },
});
