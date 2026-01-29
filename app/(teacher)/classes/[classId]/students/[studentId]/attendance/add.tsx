import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  Snackbar,
  SegmentedButtons,
  Portal,
  Modal,
  IconButton,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import {
  createAttendance,
  getStudentAttendanceForDate,
  updateAttendance,
} from '../../../../../../../src/services/attendance.service';
import { Button, Input } from '../../../../../../../src/components/common';
import { AttendanceStatus } from '../../../../../../../src/types';
import {
  format,
  addDays,
  subDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  getDay,
} from 'date-fns';

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
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

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
      const existing = await getStudentAttendanceForDate(studentId, date);

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
                  router.back();
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

      await createAttendance(studentId, classId, user.uid, {
        date,
        status,
        notes: data.notes,
      });
      router.back();
    } catch (err) {
      console.error('Error creating attendance:', err);
      setError('Failed to add attendance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (selectedDate: Date) => {
    setDate(selectedDate);
    setShowDatePicker(false);
  };

  const handleQuickDate = (daysOffset: number) => {
    const newDate = addDays(new Date(), daysOffset);
    setDate(newDate);
  };

  // Calendar rendering
  const renderCalendar = () => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Get the day of week for the first day (0 = Sunday)
    const startDayOfWeek = getDay(monthStart);

    // Create empty slots for days before the month starts
    const emptySlots = Array(startDayOfWeek).fill(null);

    const allDays = [...emptySlots, ...days];

    // Create rows of 7 days
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    return (
      <View style={styles.calendar}>
        <View style={styles.calendarHeader}>
          <IconButton
            icon="chevron-left"
            onPress={() => setCalendarMonth(subMonths(calendarMonth, 1))}
          />
          <Text variant="titleMedium" style={styles.calendarTitle}>
            {format(calendarMonth, 'MMMM yyyy')}
          </Text>
          <IconButton
            icon="chevron-right"
            onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))}
          />
        </View>

        <View style={styles.weekDays}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <Text key={day} style={styles.weekDay}>
              {day}
            </Text>
          ))}
        </View>

        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((day, dayIndex) => (
              <TouchableOpacity
                key={dayIndex}
                style={[
                  styles.dayCell,
                  day && isSameDay(day, date) && styles.selectedDay,
                  day && isSameDay(day, new Date()) && styles.today,
                ]}
                onPress={() => day && handleDateSelect(day)}
                disabled={!day}
              >
                {day && (
                  <Text
                    style={[
                      styles.dayText,
                      isSameDay(day, date) && styles.selectedDayText,
                    ]}
                  >
                    {format(day, 'd')}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
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
          keyboardDismissMode="on-drag"
        >
          <View style={styles.dateContainer}>
            <Text variant="titleMedium">Date</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => {
                setCalendarMonth(date);
                setShowDatePicker(true);
              }}
            >
              <Text variant="bodyLarge" style={styles.dateText}>
                {format(date, 'EEEE, MMMM d, yyyy')}
              </Text>
              <IconButton icon="calendar" size={20} />
            </TouchableOpacity>

            <View style={styles.quickDates}>
              <TouchableOpacity
                style={[
                  styles.quickDateButton,
                  isSameDay(date, new Date()) && styles.quickDateActive,
                ]}
                onPress={() => handleQuickDate(0)}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    isSameDay(date, new Date()) && styles.quickDateActiveText,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.quickDateButton,
                  isSameDay(date, subDays(new Date(), 1)) &&
                    styles.quickDateActive,
                ]}
                onPress={() => handleQuickDate(-1)}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    isSameDay(date, subDays(new Date(), 1)) &&
                      styles.quickDateActiveText,
                  ]}
                >
                  Yesterday
                </Text>
              </TouchableOpacity>
            </View>
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

      {/* Date Picker Modal */}
      <Portal>
        <Modal
          visible={showDatePicker}
          onDismiss={() => setShowDatePicker(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            Select Date
          </Text>
          {renderCalendar()}
          <Button mode="outlined" onPress={() => setShowDatePicker(false)}>
            Cancel
          </Button>
        </Modal>
      </Portal>

      <Portal>
        <Snackbar
          visible={!!error}
          onDismiss={() => setError(null)}
          duration={4000}
        >
          {error}
        </Snackbar>
      </Portal>
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
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dateText: {
    color: '#333',
    flex: 1,
  },
  quickDates: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickDateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
  },
  quickDateActive: {
    backgroundColor: '#1a73e8',
  },
  quickDateText: {
    fontSize: 13,
    color: '#333',
  },
  quickDateActiveText: {
    color: '#fff',
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
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 24,
    zIndex: 1000,
  },
  modalTitle: {
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  calendar: {
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarTitle: {
    fontWeight: '600',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDay: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDay: {
    backgroundColor: '#1a73e8',
  },
  today: {
    borderWidth: 1,
    borderColor: '#1a73e8',
  },
  dayText: {
    fontSize: 14,
    color: '#333',
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '600',
  },
});
