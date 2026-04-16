import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import {
  Text,
  IconButton,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { getClass } from '../../../../src/services/class.service';
import { Button } from '../../../../src/components/common';
import ReportModal, { ReportColumn, ReportRow } from '../../../../src/components/reports/ReportModal';
import { firestore } from '../../../../src/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
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
} from '../../../../src/types';
import {
  computeStudentSummaries,
  generateSummaryHtml,
  buildAttendanceRows,
  generateAttendanceHtml,
  buildHomeworkRows,
  generateHomeworkHtml,
} from '../../../../src/utils/reportUtils';

const ATTENDANCE_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', width: 100, align: 'left' },
  { key: 'student', label: 'Student', width: 130, align: 'left' },
  { key: 'status', label: 'Status', width: 80 },
  { key: 'notes', label: 'Notes', width: 160, align: 'left' },
];

const HOMEWORK_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', width: 100, align: 'left' },
  { key: 'student', label: 'Student', width: 120, align: 'left' },
  { key: 'title', label: 'Title', width: 120, align: 'left' },
  { key: 'status', label: 'Status', width: 85 },
  { key: 'evaluation', label: 'Evaluation', width: 90 },
  { key: 'description', label: 'Description', width: 150, align: 'left' },
  { key: 'notes', label: 'Notes', width: 130, align: 'left' },
];

const SUMMARY_COLUMNS: ReportColumn[] = [
  { key: 'studentName', label: 'Student', width: 120, align: 'left' },
  { key: 'totalStars', label: 'Total Stars', width: 75 },
  { key: 'averageStars', label: 'Avg Stars', width: 75 },
  { key: 'totalPresent', label: 'Present', width: 65 },
  { key: 'totalAbsent', label: 'Absent', width: 65 },
  { key: 'attendancePercent', label: 'Attend. %', width: 75 },
  { key: 'totalHomework', label: 'Total HW', width: 70 },
  { key: 'completedHomework', label: 'Completed', width: 80 },
  { key: 'lateHomework', label: 'Late', width: 55 },
  { key: 'incompleteHomework', label: 'Incomplete', width: 85 },
  { key: 'assignedHomework', label: 'Assigned', width: 75 },
];

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
  const [pdfLoading, setPdfLoading] = useState(false);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportColumns, setReportColumns] = useState<ReportColumn[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const htmlGeneratorRef = useRef<(() => string) | null>(null);

  useEffect(() => {
    if (classId) {
      getClass(classId).then(setClassData);
    }
  }, [classId]);

  const handleDateSelect = (date: Date, isStart: boolean) => {
    if (isStart) {
      setStartDate(date);
      if (date > endDate) {
        setEndDate(date);
      }
      setShowStartPicker(false);
    } else {
      setEndDate(date);
      setShowEndPicker(false);
    }
  };

  const isOwner = classData?.teacherId === user?.uid;
  const dateRangeLabel = `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;

  const fetchStudents = async (): Promise<Student[]> => {
    const studentsRef = collection(firestore, 'students');
    const q = isOwner
      ? query(studentsRef, where('classId', '==', classId), where('teacherId', '==', user?.uid))
      : query(studentsRef, where('classId', '==', classId), where('invitedTeacherIds', 'array-contains', user?.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Student[];
  };

  const fetchAttendance = async (studentIds: string[]): Promise<Attendance[]> => {
    if (studentIds.length === 0) return [];

    const start = startOfDay(startDate).getTime();
    const end = endOfDay(endDate).getTime();
    const studentIdSet = new Set(studentIds);

    const attendanceRef = collection(firestore, 'attendance');
    const q = query(attendanceRef, where('classId', '==', classId), where('invitedTeacherIds', 'array-contains', user?.uid));

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Attendance))
      .filter((a) => {
        if (!studentIdSet.has(a.studentId)) return false;
        const dateMs = a.date?.toDate().getTime() ?? 0;
        return dateMs >= start && dateMs <= end;
      });
  };

  const fetchHomework = async (studentIds: string[]): Promise<Homework[]> => {
    if (studentIds.length === 0) return [];

    const start = startOfDay(startDate).getTime();
    const end = endOfDay(endDate).getTime();
    const studentIdSet = new Set(studentIds);

    const homeworkRef = collection(firestore, 'homework');
    const q = isOwner
      ? query(homeworkRef, where('classId', '==', classId), where('teacherId', '==', user?.uid))
      : query(homeworkRef, where('classId', '==', classId), where('invitedTeacherIds', 'array-contains', user?.uid));

    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as Homework))
      .filter((h) => {
        if (!studentIdSet.has(h.studentId)) return false;
        const dateMs = h.createdAt?.toDate().getTime() ?? 0;
        return dateMs >= start && dateMs <= end;
      });
  };

  const openReportModal = (
    title: string,
    columns: ReportColumn[],
    rows: ReportRow[],
    htmlGenerator: () => string
  ) => {
    setReportTitle(title);
    setReportColumns(columns);
    setReportRows(rows);
    htmlGeneratorRef.current = htmlGenerator;
    setShowReportModal(true);
  };

  const handleExportPdf = async () => {
    if (!htmlGeneratorRef.current) return;
    setPdfLoading(true);
    try {
      const html = htmlGeneratorRef.current();
      const { uri } = await Print.printToFileAsync({
        html,
        width: 842,
        height: 595,
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${reportTitle}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Alert.alert('Error', 'Failed to export PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAttendanceReport = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const attendance = await fetchAttendance(students.map((s) => s.id));
      const studentMap = new Map(
        students.map((s) => [s.id, `${s.firstName} ${s.lastName}`])
      );
      const rows = buildAttendanceRows(attendance, studentMap);
      const className = classData?.name || 'Class';

      openReportModal(
        `${className} - Attendance Report`,
        ATTENDANCE_COLUMNS,
        rows,
        () => generateAttendanceHtml(rows, className, startDate, endDate)
      );
    } catch (error) {
      console.error('Error generating attendance report:', error);
      Alert.alert('Error', 'Failed to generate attendance report');
    } finally {
      setExporting(false);
    }
  };

  const handleHomeworkReport = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const homework = await fetchHomework(students.map((s) => s.id));
      const studentMap = new Map(
        students.map((s) => [s.id, `${s.firstName} ${s.lastName}`])
      );
      const rows = buildHomeworkRows(homework, studentMap);
      const className = classData?.name || 'Class';

      openReportModal(
        `${className} - Homework Report`,
        HOMEWORK_COLUMNS,
        rows,
        () => generateHomeworkHtml(rows, className, startDate, endDate)
      );
    } catch (error) {
      console.error('Error generating homework report:', error);
      Alert.alert('Error', 'Failed to generate homework report');
    } finally {
      setExporting(false);
    }
  };

  const handleSummaryReport = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const studentIds = students.map((s) => s.id);
      const [attendance, homework] = await Promise.all([
        fetchAttendance(studentIds),
        fetchHomework(studentIds),
      ]);
      const summaries = computeStudentSummaries(students, attendance, homework);
      const className = classData?.name || 'Class';

      // Add % suffix to attendancePercent for display
      const rows = summaries.map((s) => ({
        ...s,
        attendancePercent: `${s.attendancePercent}%`,
      }));

      openReportModal(
        `${className} - Class Summary`,
        SUMMARY_COLUMNS,
        rows,
        () => generateSummaryHtml(summaries, className, startDate, endDate)
      );
    } catch (error) {
      console.error('Error generating summary:', error);
      Alert.alert('Error', 'Failed to generate class summary');
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
              onPress={handleAttendanceReport}
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
              onPress={handleHomeworkReport}
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

            <TouchableOpacity
              style={styles.exportCard}
              onPress={handleSummaryReport}
              disabled={exporting}
            >
              <IconButton icon="clipboard-text-outline" size={32} />
              <Text variant="titleSmall" style={styles.exportTitle}>
                Class Summary
              </Text>
              <Text variant="bodySmall" style={styles.exportDescription}>
                Per-student stats: stars, attendance, homework
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
      </SafeAreaView>

      {/* Start Date Picker Modal */}
      <Modal
        visible={showStartPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStartPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContainer}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select Start Date
            </Text>
            {renderCalendar(true)}
            <Button mode="outlined" onPress={() => setShowStartPicker(false)}>
              Cancel
            </Button>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* End Date Picker Modal */}
      <Modal
        visible={showEndPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEndPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContainer}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select End Date
            </Text>
            {renderCalendar(false)}
            <Button mode="outlined" onPress={() => setShowEndPicker(false)}>
              Cancel
            </Button>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal (used for all three reports) */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onExportPdf={handleExportPdf}
        title={reportTitle}
        dateRange={dateRangeLabel}
        columns={reportColumns}
        rows={reportRows}
        pdfLoading={pdfLoading}
      />
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
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
