import React from 'react';
import { router } from 'expo-router';
import { TimeClockSheet } from '../../../src/components/timeclock/TimeClockSheet';

/** The Time sheet, opened from the bar on the Classes screen. */
export default function TimeScreen() {
  return <TimeClockSheet onDone={() => router.back()} />;
}
