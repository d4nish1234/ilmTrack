import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, Snackbar, SegmentedButtons } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import { createAttendance } from '../../../../../../../src/services/attendance.service';
import { Button, Input } from '../../../../../../../src/components/common';
import { AttendanceStatus } from '../../../../../../../src/types';
import { format } from 'date-fns';

const schema = yup.object({
  notes: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

export default function AddAttendanceScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [date] = useState(new Date());

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
      await createAttendance(studentId, classId, user.uid, {
        date,
        status,
        notes: data.notes,
      });
      router.back();
    } catch (err: any) {
      console.error('Error creating attendance:', err);
      setError('Failed to add attendance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.dateContainer}>
            <Text variant="titleMedium">Date</Text>
            <Text variant="bodyLarge" style={styles.dateText}>
              {format(date, 'EEEE, MMMM d, yyyy')}
            </Text>
          </View>

          <View style={styles.statusContainer}>
            <Text variant="titleMedium" style={styles.label}>
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

            <Button mode="outlined" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={4000}
      >
        {error}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  dateContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  dateText: {
    marginTop: 4,
    color: '#333',
  },
  statusContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  actions: {
    marginTop: 16,
  },
});
