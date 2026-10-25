import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AddHomeworkForm } from '../../../src/components/homework/AddHomeworkForm';

/**
 * Add Homework — the one route every "add homework" action opens: the Classes
 * screen's swipe "New", the student screen's Add Homework button and Homework
 * History's + button.
 *
 * It lives in the classes stack so it is always presented as a modal sheet.
 * A modal route nested further down (the old students/[studentId]/homework/add)
 * only appeared as a sheet when something was already below it in its own
 * stack, so it slid in like a normal page from the student screen.
 */
export default function AddHomeworkScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  return <AddHomeworkForm classId={classId} studentId={studentId} onDone={() => router.back()} />;
}
