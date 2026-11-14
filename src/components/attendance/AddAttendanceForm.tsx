import React, { useState, useEffect } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Chip, Text, SegmentedButtons } from 'react-native-paper';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAttendance,
  getStudentAttendanceForDate,
  updateAttendance,
} from '../../services/attendance.service';
import { getStudent, getInvitedTeacherIds } from '../../services/student.service';
import { Button, Input, AppSnackbar } from '../common';
import { DateField } from '../timekeeping/DateField';
import { AttendanceStatus, Student } from '../../types';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { colors, radius, spacing, typography } from '../../constants/theme';

const schema = yup.object({
  notes: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

interface AddAttendanceFormProps {
  classId: string | undefined;
  studentId: string | undefined;
  /** Called after attendance is saved, and on Cancel. */
  onDone: () => void;
}

/**
 * The Add Attendance form: date, status, notes. Rendered by the
 * classes/add-attendance route, which every "add attendance" action opens.
 */
export function AddAttendanceForm({ classId, studentId, onDone }: AddAttendanceFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [date, setDate] = useState(new Date());
  const [student, setStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (studentId) {
      getStudent(studentId).then(setStudent);
    }
  }, [studentId]);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      notes: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!classId || !studentId || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Check if attendance already exists for this date
      const existing = await getStudentAttendanceForDate(studentId, user.uid, date);

      if (existing) {
        // Update existing attendance
        Alert.alert(
          'Attendance Already Exists',
          `Attendance for ${format(date, 'MMMM d, yyyy')} already exists as "${existing.status}". Do you want to update it?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setLoading(false),
            },
            {
              text: 'Update',
              onPress: async () => {
                try {
                  await updateAttendance(existing.id, {
                    status,
                    notes: data.notes || undefined,
                  });
                  onDone();
                } catch (err) {
                  console.error('Error updating attendance:', err);
                  setError('Failed to update attendance. Please try again.');
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      const freshTeacherIds = await getInvitedTeacherIds(classId);
      await createAttendance(studentId, classId, user.uid, {
        date,
        status,
        notes: data.notes,
      }, student?.parentUserIds || [], freshTeacherIds);
      onDone();
    } catch (err) {
      console.error('Error creating attendance:', err);
      setError('Failed to add attendance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickDates = [
    { label: 'Today', offset: 0 },
    { label: 'Yesterday', offset: -1 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.dateContainer}>
            <View style={styles.dateRow}>
              <Text variant={typography.h4}>Date</Text>
              <DateField
                value={format(date, 'yyyy-MM-dd')}
                onChange={(value) => setDate(parseISO(value))}
              />
            </View>
            <View style={styles.quickDates}>
              {quickDates.map(({ label, offset }) => {
                const on = isSameDay(date, addDays(new Date(), offset));
                return (
                  <Chip
                    key={label}
                    selected={on}
                    showSelectedOverlay
                    onPress={() => setDate(addDays(new Date(), offset))}
                    accessibilityLabel={`${label}${on ? ', selected' : ''}`}
                  >
                    {label}
                  </Chip>
                );
              })}
            </View>
          </View>

          <View style={styles.statusContainer}>
            <Text variant={typography.h4} style={styles.label}>
              Attendance Status
            </Text>
            <SegmentedButtons
              value={status}
              onValueChange={(value) => setStatus(value as AttendanceStatus)}
              buttons={[
                { value: 'present', label: 'Present' },
                { value: 'absent', label: 'Absent' },
                { value: 'late', label: 'Late' },
                { value: 'excused', label: 'Excused' },
              ]}
              style={styles.segmentedButtons}
            />
          </View>

          <Input
            control={control}
            name="notes"
            label="Notes (Optional)"
            placeholder="Any additional notes"
            multiline
            numberOfLines={3}
          />

          <View style={styles.actions}>
            <Button onPress={handleSubmit(onSubmit)} loading={loading}>
              Add Attendance
            </Button>

            <Button mode="outlined" onPress={onDone}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppSnackbar message={error} onDismiss={() => setError(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  dateContainer: {
    marginBottom: 20,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickDates: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusContainer: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
  },
  segmentedButtons: {
    marginBottom: spacing.sm,
  },
  actions: {
    marginTop: spacing.lg,
  },
});
