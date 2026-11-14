import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import { Tappable } from '../../../../src/components/common';
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
import { AppSnackbar } from '../../../../src/components/common';
import { DateField } from '../../../../src/components/timekeeping/DateField';
import ReportModal, { ReportColumn, ReportRow } from '../../../../src/components/reports/ReportModal';
import { firestore } from '../../../../src/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { format, parseISO, startOfMonth, startOfDay, endOfDay } from 'date-fns';
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
import { colors, fontWeight, radius, spacing, typography } from '../../../../src/constants/theme';

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
  const [exporting, setExporting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportColumns, setReportColumns] = useState<ReportColumn[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const htmlGeneratorRef = useRef<((filteredRows: ReportRow[]) => string) | null>(null);

  useEffect(() => {
    if (classId) {
      getClass(classId).then(setClassData);
    }
  }, [classId]);

  const day = (date: Date) => format(date, 'yyyy-MM-dd');
  // A start after the end moves the end along.
  const setStart = (value: string) => {
    const date = parseISO(value);
    setStartDate(date);
    if (date > endDate) setEndDate(date);
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
    htmlGenerator: (filteredRows: ReportRow[]) => string
  ) => {
    setReportTitle(title);
    setReportColumns(columns);
    setReportRows(rows);
    htmlGeneratorRef.current = htmlGenerator;
    setShowReportModal(true);
  };

  const handleExportPdf = async (filteredRows: ReportRow[]) => {
    if (!htmlGeneratorRef.current) return;
    setPdfLoading(true);
    try {
      const html = htmlGeneratorRef.current(filteredRows);
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
      // Reset loading before sharing so iOS Print→Cancel doesn't leave the button stuck
      setPdfLoading(false);
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: reportTitle,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Alert.alert('Error', 'Failed to export PDF');
      setPdfLoading(false);
    }
  };

  const handleAttendanceReport = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const attendance = await fetchAttendance(students.map((s) => s.id));
      const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
      const rows = buildAttendanceRows(attendance, studentMap);
      const className = classData?.name || 'Class';

      openReportModal(
        `${className} - Attendance Report`,
        ATTENDANCE_COLUMNS,
        rows,
        (filtered) => generateAttendanceHtml(filtered, className, startDate, endDate)
      );
    } catch (error) {
      console.error('Error generating attendance report:', error);
      setError("Couldn't make the attendance report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleHomeworkReport = async () => {
    setExporting(true);
    try {
      const students = await fetchStudents();
      const homework = await fetchHomework(students.map((s) => s.id));
      const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
      const rows = buildHomeworkRows(homework, studentMap);
      const className = classData?.name || 'Class';

      openReportModal(
        `${className} - Homework Report`,
        HOMEWORK_COLUMNS,
        rows,
        (filtered) => generateHomeworkHtml(filtered, className, startDate, endDate)
      );
    } catch (error) {
      console.error('Error generating homework report:', error);
      setError("Couldn't make the homework report. Please try again.");
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

      openReportModal(
        `${className} - Class Summary`,
        SUMMARY_COLUMNS,
        summaries,
        (filtered) => {
          const names = new Set(filtered.map((r) => r.studentName));
          return generateSummaryHtml(
            summaries.filter((s) => names.has(s.studentName)),
            className,
            startDate,
            endDate
          );
        }
      );
    } catch (error) {
      console.error('Error generating summary:', error);
      setError("Couldn't make the class summary. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Reports',
          headerLeft: () => (
            <IconButton
              icon="close"
              iconColor={colors.onPrimary}
              size={24}
              style={{ margin: 0 }}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text variant={typography.h4} style={styles.sectionTitle}>
            Date Range
          </Text>
          <Text variant={typography.caption} style={styles.hint}>
            Select the date range for your report
          </Text>

          <View style={styles.dateRow}>
            <Text variant={typography.bodyLarge}>From</Text>
            <DateField value={day(startDate)} onChange={setStart} />
          </View>
          <View style={styles.dateRow}>
            <Text variant={typography.bodyLarge}>To</Text>
            <DateField value={day(endDate)} onChange={(v) => setEndDate(parseISO(v))} minimumDate={day(startDate)} />
          </View>

          <Divider style={styles.divider} />

          <Text variant={typography.h4} style={styles.sectionTitle}>
            Export Data
          </Text>
          <Text variant={typography.caption} style={styles.hint}>
            Preview a report, then export it as a PDF
          </Text>

          <View style={styles.exportButtons}>
            <Tappable
              style={styles.exportCard}
              onPress={handleAttendanceReport}
              disabled={exporting}
            >
              <IconButton icon="calendar-check" size={32} />
              <Text variant={typography.h5} style={styles.exportTitle}>
                Attendance Report
              </Text>
              <Text variant={typography.caption} style={styles.exportDescription}>
                Export all attendance records for this class
              </Text>
            </Tappable>

            <Tappable
              style={styles.exportCard}
              onPress={handleHomeworkReport}
              disabled={exporting}
            >
              <IconButton icon="book-open-variant" size={32} />
              <Text variant={typography.h5} style={styles.exportTitle}>
                Homework Report
              </Text>
              <Text variant={typography.caption} style={styles.exportDescription}>
                Export all homework records with evaluations
              </Text>
            </Tappable>

            <Tappable
              style={styles.exportCard}
              onPress={handleSummaryReport}
              disabled={exporting}
            >
              <IconButton icon="clipboard-text-outline" size={32} />
              <Text variant={typography.h5} style={styles.exportTitle}>
                Class Summary
              </Text>
              <Text variant={typography.caption} style={styles.exportDescription}>
                Per-student stats: stars, attendance, homework
              </Text>
            </Tappable>
          </View>

          {exporting && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" />
              <Text variant={typography.caption} style={styles.loadingText}>
                Preparing report...
              </Text>
            </View>
          )}
        </ScrollView>
        <AppSnackbar message={error} onDismiss={() => setError(null)} wrapInPortal={false} />
      </SafeAreaView>

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
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  divider: {
    marginVertical: spacing.xl,
  },
  exportButtons: {
    gap: spacing.md,
  },
  exportCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  exportTitle: {
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  exportDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
  },
});
