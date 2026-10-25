import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card, IconButton, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { getRecentPendingHomeworkAsTeacher, updateHomework } from '../../services/homework.service';
import { getStudent } from '../../services/student.service';
import { AppSnackbar, Button } from '../common';
import type { Homework, HomeworkEvaluation, HomeworkStatus, Student } from '../../types';

interface EvaluateHomeworkFormProps {
  studentId: string | undefined;
  /** Called on Close. */
  onDone: () => void;
}

/**
 * Evaluate a student's pending homework: a star rating and optional comment
 * per item, saved together with Complete, Late or Incomplete. Rendered by the
 * classes/evaluate-homework route, opened from the Classes screen's swipe
 * "Evaluate" action.
 */
export function EvaluateHomeworkForm({ studentId, onDone }: EvaluateHomeworkFormProps) {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [pendingHomework, setPendingHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingHomeworkId, setUpdatingHomeworkId] = useState<string | null>(null);
  const [selectedEvaluations, setSelectedEvaluations] = useState<
    Record<string, HomeworkEvaluation | null>
  >({});
  const [homeworkComments, setHomeworkComments] = useState<Record<string, string>>({});
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!studentId || !uid) return;
    getStudent(studentId).then(setStudent).catch(() => setStudent(null));
    getRecentPendingHomeworkAsTeacher(studentId, uid, 3)
      .then(setPendingHomework)
      .catch((error) => {
        console.error('Error fetching pending homework:', error);
        Alert.alert('Error', 'Failed to load homework');
      })
      .finally(() => setLoading(false));
  }, [studentId, uid]);

  const handleQuickStatusUpdate = async (homeworkId: string, status: HomeworkStatus) => {
    const evaluation = selectedEvaluations[homeworkId];
    if (!evaluation) {
      Alert.alert('Rating Required', 'Please select a star rating before marking the homework.');
      return;
    }

    setUpdatingHomeworkId(homeworkId);
    try {
      const comment = homeworkComments[homeworkId]?.trim();
      const updateData: { status: HomeworkStatus; evaluation: HomeworkEvaluation; notes?: string } = {
        status,
        evaluation,
      };
      if (comment) {
        updateData.notes = comment;
      }
      await updateHomework(homeworkId, updateData);
      setSnackbarMessage(`Homework marked as ${status}`);
      setPendingHomework((prev) => prev.filter((h) => h.id !== homeworkId));
      setSelectedEvaluations((prev) => {
        const updated = { ...prev };
        delete updated[homeworkId];
        return updated;
      });
      setHomeworkComments((prev) => {
        const updated = { ...prev };
        delete updated[homeworkId];
        return updated;
      });
      if (studentId && uid && pendingHomework.length > 1) {
        const moreHomework = await getRecentPendingHomeworkAsTeacher(studentId, uid, 3);
        setPendingHomework(moreHomework.filter((h) => h.id !== homeworkId));
      }
    } catch (error) {
      console.error('Error updating homework:', error);
      Alert.alert('Error', 'Failed to update homework');
    } finally {
      setUpdatingHomeworkId(null);
    }
  };

  const handleStarPress = (homeworkId: string, rating: HomeworkEvaluation) => {
    setSelectedEvaluations((prev) => ({
      ...prev,
      [homeworkId]: prev[homeworkId] === rating ? null : rating,
    }));
  };

  const renderStars = (homeworkId: string) => {
    const currentRating = selectedEvaluations[homeworkId] || 0;
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleStarPress(homeworkId, star as HomeworkEvaluation)}
            style={styles.starButton}
          >
            <IconButton
              icon={star <= currentRating ? 'star' : 'star-outline'}
              iconColor={star <= currentRating ? '#ffc107' : '#ccc'}
              size={28}
              style={styles.noMargin}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const statusButton = (
    hw: Homework,
    status: HomeworkStatus,
    label: string,
    icon: string,
    colorStyle: object
  ) => (
    <TouchableOpacity
      style={[styles.statusButton, colorStyle, updatingHomeworkId === hw.id && styles.statusButtonDisabled]}
      onPress={() => handleQuickStatusUpdate(hw.id, status)}
      disabled={updatingHomeworkId === hw.id}
    >
      <IconButton icon={icon} iconColor="#fff" size={24} style={styles.noMargin} />
      <Text style={styles.statusButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
      >
        {student && (
          <Text variant="titleMedium" style={styles.studentName}>
            {student.firstName} {student.lastName}
          </Text>
        )}

        {loading ? (
          <View style={styles.placeholder}>
            <Text variant="bodyMedium" style={styles.muted}>Loading...</Text>
          </View>
        ) : pendingHomework.length === 0 ? (
          <View style={styles.placeholder}>
            <Text variant="bodyMedium" style={styles.muted}>
              No pending homework to evaluate
            </Text>
          </View>
        ) : (
          <View style={styles.homeworkList}>
            {pendingHomework.map((hw) => (
              <Card key={hw.id} style={styles.homeworkCard}>
                <Card.Content style={styles.homeworkCardContent}>
                  <View style={styles.homeworkHeader}>
                    <Text variant="titleMedium" style={styles.homeworkTitleText}>
                      {hw.title}
                    </Text>
                    <Text variant="bodySmall" style={styles.homeworkDate}>
                      {hw.createdAt ? format(hw.createdAt.toDate(), 'MMM d') : 'Today'}
                    </Text>
                  </View>

                  {renderStars(hw.id)}

                  <TextInput
                    placeholder="Comment (optional)"
                    value={homeworkComments[hw.id] || ''}
                    onChangeText={(text) =>
                      setHomeworkComments((prev) => ({ ...prev, [hw.id]: text }))
                    }
                    mode="outlined"
                    dense
                    style={styles.commentInput}
                  />

                  <View style={styles.statusButtons}>
                    {statusButton(hw, 'completed', 'Complete', 'check', styles.statusComplete)}
                    {statusButton(hw, 'late', 'Late', 'clock-outline', styles.statusLate)}
                    {statusButton(hw, 'incomplete', 'Incomplete', 'close', styles.statusIncomplete)}
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

        <Button mode="outlined" onPress={onDone} style={styles.closeButton}>
          Close
        </Button>
      </KeyboardAwareScrollView>

      <AppSnackbar
        type="success"
        message={snackbarMessage}
        onDismiss={() => setSnackbarMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  studentName: {
    color: '#666',
    marginBottom: 12,
  },
  placeholder: {
    padding: 24,
    alignItems: 'center',
  },
  muted: {
    color: '#666',
    textAlign: 'center',
  },
  homeworkList: {
    gap: 12,
  },
  homeworkCard: {
    backgroundColor: '#f9f9f9',
  },
  homeworkCardContent: {
    flexDirection: 'column',
    paddingVertical: 12,
    gap: 12,
  },
  homeworkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeworkTitleText: {
    fontWeight: '600',
    flex: 1,
  },
  homeworkDate: {
    color: '#666',
    marginLeft: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  starButton: {
    padding: 0,
  },
  noMargin: {
    margin: 0,
  },
  commentInput: {
    backgroundColor: '#fff',
    fontSize: 14,
  },
  statusButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  statusComplete: {
    backgroundColor: '#4caf50',
  },
  statusLate: {
    backgroundColor: '#ff9800',
  },
  statusIncomplete: {
    backgroundColor: '#f44336',
  },
  statusButtonDisabled: {
    opacity: 0.5,
  },
  statusButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    marginTop: -4,
  },
  closeButton: {
    marginTop: 16,
  },
});
