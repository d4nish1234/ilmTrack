import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { EvaluateHomeworkForm } from '../../../src/components/homework/EvaluateHomeworkForm';

/**
 * Evaluate Homework, opened from the Classes screen's swipe "Evaluate".
 * In the classes stack so it is presented as a modal sheet, like
 * add-homework and add-attendance.
 */
export default function EvaluateHomeworkScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  return <EvaluateHomeworkForm studentId={studentId} onDone={() => router.back()} />;
}
