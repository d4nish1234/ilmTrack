import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
} from 'react-native';
import {
  Text,
  IconButton,
  Portal,
  Modal,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { getClass } from '../../../../src/services/class.service';
import { Button } from '../../../../src/components/common';
import { firestore } from '../../../../src/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  getDay,
  startOfDay,
  endOfDay,
} from 'date-fns';
import {
  Class,
  Student,
  Attendance,
  Homework,
  EVALUATION_LABELS,
  HomeworkEvaluation,
} from '../../../../src/types';

export default function ReportsScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [classData, setClassData] = useState<Class | null>(null);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (classId) {
      getClass(classId).then(setClassData);
    }
  }, [classId]);

  const handleDateSelect = (date: Date, isStart: boolean) => {
    if (isStart) {
      setStartDate(date);
      // If start is after end, adjust end
      if (date > endDate) {
        setEndDate(date);
      }
      setShowStartPicker(false);
    } else {
      setEndDate(date);
      setShowEndPicker(false);
    }
  };

  const fetchStudents = async (): Promise<Student[]> => {
    const studentsRef = collection(firestore, 'students');
    const q = query(studentsRef, where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Student[];
  };

  const fetchAttendance = async (
    studentIds: string[]
  ): Promise<Attendance[]> => {
    if (studentIds.length === 0) return [];

    const attendanceRef = collection(firestore, 'attendance');
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));

    // Firestore 'in' queries are limited to 10 items
    const batches: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      batches.push(studentIds.slice(i, i + 10));
    }

    const results: Attendance[] = [];
    for (const batch of batches) {
      const q = query(
        attendanceRef,
        where('studentId', 'in', batch),
        where('date', '>=', start),
        where('date', '<=', end)
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as Attendance);
      });
    }

    return results;
  };

  const fetchHomework = async (studentIds: string[]): Promise<Homework[]> => {
    if (studentIds.length === 0) return [];

    const homeworkRef = collection(firestore, 'homework');
    const start = Timestamp.fromDate(startOfDay(startDate));
    const end = Timestamp.fromDate(endOfDay(endDate));

    // Firestore 'in' queries are limited to 10 items
    const batches: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      batches.push(studentIds.slice(i, i + 10));
    }

    const results: Homework[] = [];
    for (const batch of batches) {
      const q = query(
        homeworkRef,
        where('studentId', 'in', batch),
        where('createdAt', '>=', start),
        where('createdAt', '<=', end)
      );
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as Homework);
      });
    }

    return results;
  };

  const exportAttendance = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const attendance = await fetchAttendance(students.map((s) => s.id));

      // Create student lookup
      const studentMap = new Map(
        students.map((s) => [s.id, `${s.firstName} ${s.lastName}`])
      );

      // Sort attendance by date
      attendance.sort((a, b) => {
        const aDate = a.date?.toDate().getTime() || 0;
        const bDate = b.date?.toDate().getTime() || 0;
        return aDate - bDate;
      });

      // Generate CSV
      const headers = ['Date', 'Student', 'Status', 'Notes'];
      const rows = attendance.map((a) => [
        a.date ? format(a.date.toDate(), 'yyyy-MM-dd') : '',
        studentMap.get(a.studentId) || 'Unknown',
        a.status,
        a.notes || '',
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      // Share the CSV
      await Share.share({
        message: csv,
        title: `${classData?.name || 'Class'} Attendance Report`,
      });
    } catch (error) {
      console.error('Error exporting attendance:', error);
      Alert.alert('Error', 'Failed to export attendance data');
    } finally {
      setExporting(false);
    }
  };

  const exportHomework = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const homework = await fetchHomework(students.map((s) => s.id));

      // Create student lookup
      const studentMap = new Map(
        students.map((s) => [s.id, `${s.firstName} ${s.lastName}`])
      );

      // Sort homework by date
      homework.sort((a, b) => {
        const aDate = a.createdAt?.toDate().getTime() || 0;
        const bDate = b.createdAt?.toDate().getTime() || 0;
        return aDate - bDate;
      });

      // Generate CSV
      const headers = [
        'Date',
        'Student',
        'Title',
        'Status',
        'Evaluation',
        'Description',
        'Notes',
      ];
      const rows = homework.map((h) => [
        h.createdAt ? format(h.createdAt.toDate(), 'yyyy-MM-dd') : '',
        studentMap.get(h.studentId) || 'Unknown',
        h.title,
        h.status,
        h.evaluation
          ? EVALUATION_LABELS[h.evaluation as HomeworkEvaluation]
          : '',
        h.description || '',
        h.notes || '',
      ]);

      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      // Share the CSV
      await Share.share({
        message: csv,
        title: `${classData?.name || 'Class'} Homework Report`,
      });
    } catch (error) {
      console.error('Error exporting homework:', error);
      Alert.alert('Error', 'Failed to export homework data');
    } finally {
      setExporting(false);
    }
  };

  // Calendar rendering
  const renderCalendar = (isStart: boolean) => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDayOfWeek = getDay(monthStart);
    const emptySlots = Array(startDayOfWeek).fill(null);
    const allDays = [...emptySlots, ...days];
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    const selectedDate = isStart ? startDate : endDate;

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
                  day && isSameDay(day, selectedDate) && styles.selectedDay,
                  day && isSameDay(day, new Date()) && styles.today,
                ]}
                onPress={() => day && handleDateSelect(day, isStart)}
                disabled={!day}
              >
                {day && (
                  <Text
                    style={[
                      styles.dayText,
                      isSameDay(day, selectedDate) && styles.selectedDayText,
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
    <>
      <Stack.Screen
        options={{
          title: 'Reports',
          headerLeft: () => (
            <IconButton
              icon="close"
              iconColor="#fff"
              size={24}
              style={{ margin: 0 }}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Date Range
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            Select the date range for your report
          </Text>

          <View style={styles.dateRow}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setCalendarMonth(startDate);
                setShowStartPicker(true);
              }}
            >
              <Text variant="bodySmall" style={styles.dateLabel}>
                Start Date
              </Text>
              <Text variant="bodyLarge" style={styles.dateValue}>
                {format(startDate, 'MMM d, yyyy')}
              </Text>
            </TouchableOpacity>

            <Text style={styles.dateSeparator}>to</Text>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setCalendarMonth(endDate);
                setShowEndPicker(true);
              }}
            >
              <Text variant="bodySmall" style={styles.dateLabel}>
                End Date
              </Text>
              <Text variant="bodyLarge" style={styles.dateValue}>
                {format(endDate, 'MMM d, yyyy')}
              </Text>
            </TouchableOpacity>
          </View>

          <Divider style={styles.divider} />

          <Text variant="titleMedium" style={styles.sectionTitle}>
            Export Data
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            Download attendance or homework records as CSV
          </Text>

          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={styles.exportCard}
              onPress={exportAttendance}
              disabled={exporting}
            >
              <IconButton icon="calendar-check" size={32} />
              <Text variant="titleSmall" style={styles.exportTitle}>
                Attendance Report
              </Text>
              <Text variant="bodySmall" style={styles.exportDescription}>
                Export all attendance records for this class
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exportCard}
              onPress={exportHomework}
              disabled={exporting}
            >
              <IconButton icon="book-open-variant" size={32} />
              <Text variant="titleSmall" style={styles.exportTitle}>
                Homework Report
              </Text>
              <Text variant="bodySmall" style={styles.exportDescription}>
                Export all homework records with evaluations
              </Text>
            </TouchableOpacity>
          </View>

          {exporting && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" />
              <Text variant="bodySmall" style={styles.loadingText}>
                Preparing report...
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Start Date Picker Modal */}
        <Portal>
          <Modal
            visible={showStartPicker}
            onDismiss={() => setShowStartPicker(false)}
            contentContainerStyle={styles.modalContainer}
          >
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select Start Date
            </Text>
            {renderCalendar(true)}
            <Button mode="outlined" onPress={() => setShowStartPicker(false)}>
              Cancel
            </Button>
          </Modal>
        </Portal>

        {/* End Date Picker Modal */}
        <Portal>
          <Modal
            visible={showEndPicker}
            onDismiss={() => setShowEndPicker(false)}
            contentContainerStyle={styles.modalContainer}
          >
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select End Date
            </Text>
            {renderCalendar(false)}
            <Button mode="outlined" onPress={() => setShowEndPicker(false)}>
              Cancel
            </Button>
          </Modal>
        </Portal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  hint: {
    color: '#666',
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateButton: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  dateLabel: {
    color: '#666',
    marginBottom: 4,
  },
  dateValue: {
    fontWeight: '500',
  },
  dateSeparator: {
    color: '#666',
  },
  divider: {
    marginVertical: 24,
  },
  exportButtons: {
    gap: 12,
  },
  exportCard: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
  },
  exportTitle: {
    fontWeight: '600',
    marginTop: 4,
  },
  exportDescription: {
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  loadingText: {
    color: '#666',
  },
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
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
