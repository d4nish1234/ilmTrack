import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { HelpSheet, type HelpItem } from '../../../src/components/common';
import { markHelpSeen } from '../../../src/utils/storage';

const ITEMS: HelpItem[] = [
  {
    icon: 'map-marker-outline',
    title: 'Locations',
    text: "Your school's address. Teachers can only start a shift when they're there, so hours are recorded on site. Add them in Settings, under ⋮.",
  },
  {
    icon: 'calendar-sync',
    title: 'Schedules',
    text: 'The same shifts for many people at once, like Mon–Thu 4–6 PM for a term. Also in Settings. For a one-off change, tap a person or a day.',
  },
  {
    icon: 'account-clock-outline',
    title: 'This week',
    text: "Who's on shift now, and each person's hours worked against scheduled. Switch to Week to see everyone's shifts by day.",
  },
  {
    icon: 'file-pdf-box',
    title: 'Export',
    text: 'Share a PDF timesheet for any people and dates, from the ⋮ menu.',
  },
];

/**
 * What Timekeeping is for, as a bottom sheet: opened by itself the first time
 * an admin visits Timekeeping on this device, then from its help link. Closing
 * it, by Got it, a swipe down or a tap outside, records it as seen.
 */
export default function TimekeepingHelpScreen() {
  useEffect(() => () => void markHelpSeen('timekeeping'), []);

  return (
    <HelpSheet
      title="Timekeeping"
      intro="Teachers start and end their shifts from the Time bar on their Classes screen. Here you set it up and see their hours."
      items={ITEMS}
      onDone={() => router.back()}
    />
  );
}
