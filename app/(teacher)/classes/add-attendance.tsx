import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AddAttendanceForm } from '../../../src/components/attendance/AddAttendanceForm';

/**
 * Add Attendance — the one route every "add attendance" action opens: the
 * student screen's Add Attendance button and Attendance History's + button.
 * In the classes stack so it is always presented as a modal sheet; see
 * add-homework.tsx for why.
 */
export default function AddAttendanceScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  return <AddAttendanceForm classId={classId} studentId={studentId} onDone={() => router.back()} />;
}
