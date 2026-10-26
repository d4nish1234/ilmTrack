import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, Text } from 'react-native-paper';
import { Button, LoadingSpinner } from '../common';
import { getMyWeek, subscribeToMyEntries } from '../../services/timeclock.service';
import { shiftViews, weekRangeLabel, weekTotals } from '../../utils/timeclock';
import { formatDuration, shiftWeek } from '../../utils/timekeeping';
import type { MyTimekeeping, TimeEntry } from '../../types';
import { WeekRow } from './WeekRow';

interface TimeHistoryProps {
  teacherId: string;
  /** The organizations the time clock shows (the selected class's). */
  orgIds: string[];
  /** The current week's Monday; the pager starts a week before it and stops at it. */
  thisWeek: string;
  now: number;
  onBack: () => void;
}

/**
 * The teacher's past weeks, one at a time: every shift they were scheduled
 * for, what they worked on each (missed ones show "Not started"), and the
 * week's total. Shifts come from getMyWeek; hours are read live, so an
 * admin's correction shows straight away.
 */
export function TimeHistory({ teacherId, orgIds, thisWeek, now, onBack }: TimeHistoryProps) {
  const [weekStart, setWeekStart] = useState(() => shiftWeek(thisWeek, -1));
  const [data, setData] = useState<MyTimekeeping | null>(null);
  const [entries, setEntries] = useState<Map<string, TimeEntry>>(new Map());
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Weeks already loaded while the sheet is open, so paging back is instant.
  // Their hours stay live (the listener below), so nothing here goes stale.
  const loaded = useRef(new Map<string, MyTimekeeping>());

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const cached = loaded.current.get(weekStart);
    setData(cached ?? null);
    if (cached) return;
    getMyWeek(weekStart)
      .then((d) => {
        loaded.current.set(weekStart, d);
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        console.error('Error loading week:', err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, attempt]);

  useEffect(() => {
    setEntries(new Map());
    return subscribeToMyEntries(teacherId, [weekStart], setEntries, (err) =>
      console.error('Error loading hours:', err)
    );
  }, [teacherId, weekStart]);

  const orgKey = orgIds.join(',');
  // Only the organizations the time clock shows, as on the main view.
  const week = useMemo(
    () => (data ? { ...data, orgs: data.orgs.filter((o) => orgKey.split(',').includes(o.orgId)) } : null),
    [data, orgKey]
  );
  const views = useMemo(() => shiftViews(week, entries, teacherId), [week, entries, teacherId]);
  const showOrgs = new Set(views.map((v) => v.orgId)).size > 1;
  const totals = week ? weekTotals(week, views, now) : null;

  return (
    <View>
      <View style={styles.pager}>
        <IconButton
          icon="chevron-left"
          onPress={() => setWeekStart((w) => shiftWeek(w, -1))}
          accessibilityLabel="Previous week"
        />
        <Text variant="titleMedium" style={styles.range}>
          {weekRangeLabel(weekStart, new Date(now).getFullYear())}
        </Text>
        <IconButton
          icon="chevron-right"
          onPress={() => setWeekStart((w) => shiftWeek(w, 1))}
          disabled={weekStart >= thisWeek}
          accessibilityLabel="Next week"
        />
      </View>

      {error ? (
        <View style={styles.message}>
          <Text variant="bodyMedium" style={styles.muted}>
            Couldn&apos;t load this week.
          </Text>
          <Button mode="text" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </View>
      ) : !data ? (
        <View style={styles.loading}>
          <LoadingSpinner />
        </View>
      ) : views.length === 0 ? (
        <Text variant="bodyMedium" style={[styles.muted, styles.message]}>
          No shifts this week.
        </Text>
      ) : (
        <>
          <Text variant="bodyLarge" style={styles.total}>
            Worked {formatDuration(totals!.workedMinutes)}
            {totals!.scheduledMinutes > 0 ? ` of ${formatDuration(totals!.scheduledMinutes)}` : ''}
          </Text>
          {views.map((s, i) => (
            <View key={s.entryId}>
              {i > 0 && <Divider />}
              <WeekRow shift={s} now={now} showOrg={showOrgs} />
            </View>
          ))}
        </>
      )}

      <Button mode="outlined" icon="arrow-left" onPress={onBack} style={styles.back}>
        Back to this week
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  range: {
    fontWeight: '600',
  },
  total: {
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  muted: {
    color: '#666',
  },
  message: {
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: 24,
  },
  loading: {
    height: 120,
  },
  back: {
    marginTop: 24,
  },
});
