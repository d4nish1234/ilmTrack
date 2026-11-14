import React, { type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Text } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import type { TimesheetRow } from '../../utils/timesheet';
import { formatTime } from '../../utils/timekeeping';
import { cellTone, gridCells, rowHeight, shortRange, type CellTone, type GridCell } from '../../utils/weekGrid';
import { colors, fontSize, fontWeight, radius, spacing, typography } from '../../constants/theme';

const NAME_WIDTH = 104;
/** Columns narrower than this scroll sideways instead. */
const MIN_COLUMN = 52;
const HEADER_HEIGHT = 40;

const TONE: Record<CellTone, { color: string; label: string }> = {
  worked: { color: colors.success, label: 'Worked' },
  live: { color: colors.onPrimary, label: 'On shift' },
  missed: { color: colors.danger, label: 'Not started' },
  late: { color: colors.warning, label: 'Not started yet' },
  upcoming: { color: colors.text, label: 'Upcoming' },
};

/** Each day column's width: the screen shared between the days, but never narrower than MIN_COLUMN. */
export function useGridColumn(days: number): number {
  const { width } = useWindowDimensions();
  return Math.max(MIN_COLUMN, Math.floor((width - NAME_WIDTH) / Math.max(1, days)));
}

interface HeaderProps {
  dates: string[];
  today: string;
  column: number;
  /** Scrolled by the grid below, so the days line up; it can't be scrolled itself. */
  scrollRef: RefObject<ScrollViewInstance | null>;
}

/**
 * The days across the top. A separate piece from the grid so the screen can
 * keep it in view (a sticky header) while a long list of people scrolls.
 */
export function WeekGridHeader({ dates, today, column, scrollRef }: HeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={{ width: NAME_WIDTH }} />
      <ScrollView ref={scrollRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
        {dates.map((date) => (
          <View key={date} style={[styles.dayHead, { width: column }, date === today && styles.today]}>
            <Text variant={typography.labelMedium} style={date === today ? styles.todayText : styles.muted}>
              {format(parseISO(date), 'EEE')}
            </Text>
            <Text variant={typography.labelSmall} style={date === today ? styles.todayText : styles.muted}>
              {format(parseISO(date), 'd')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface WeekGridProps {
  people: { uid: string; name: string }[];
  /** Each person's week (timesheetRows). */
  rowsFor: (uid: string) => TimesheetRow[];
  /** The columns, 'yyyy-MM-dd' (gridDates). */
  dates: string[];
  today: string;
  column: number;
  /** The days' sideways scroll, for WeekGridHeader to follow. */
  onScrollX: (x: number) => void;
  onPressName: (uid: string) => void;
  /** A cell: its shifts (none for an empty day). */
  onPressCell: (uid: string, cell: GridCell) => void;
}

/**
 * Everyone's week at a glance: a row per person, a column per day, each
 * shift as its short time ("4–6") coloured by what happened. The names stay
 * put while the days scroll sideways when they don't fit. Empty days from
 * today on show a faint +, since tapping one adds a shift.
 */
export function WeekGrid({ people, rowsFor, dates, today, column, onScrollX, onPressName, onPressCell }: WeekGridProps) {
  const grid = people.map((p) => {
    const cells = gridCells(rowsFor(p.uid), dates);
    return { ...p, cells, height: rowHeight(cells) };
  });

  return (
    <View>
      <View style={styles.grid}>
        <View style={{ width: NAME_WIDTH }}>
          {grid.map((p) => (
            <Pressable
              key={p.uid}
              onPress={() => onPressName(p.uid)}
              style={({ pressed }) => [styles.name, { height: p.height }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}'s week`}
            >
              <Text variant={typography.body} numberOfLines={2} style={styles.nameText}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          onScroll={(e) => onScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          <View>
            {grid.map((p) => (
              <View key={p.uid} style={[styles.row, { height: p.height }]}>
                {p.cells.map((cell) => (
                  <Pressable
                    key={cell.date}
                    onPress={() => onPressCell(p.uid, cell)}
                    style={({ pressed }) => [
                      styles.cell,
                      { width: column },
                      cell.date === today && styles.todayColumn,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={cellLabel(p.name, cell, today)}
                  >
                    {cell.rows.length === 0 ? (
                      <Text style={styles.empty}>{cell.date >= today ? '+' : '·'}</Text>
                    ) : (
                      cell.shown.map((r, i) => {
                        const tone = cellTone(r.status);
                        const last = i === cell.shown.length - 1;
                        return (
                          <Text
                            key={r.shiftId}
                            variant={typography.labelMedium}
                            numberOfLines={1}
                            style={[
                              styles.time,
                              { color: TONE[tone].color },
                              tone === 'live' && styles.live,
                              r.removed && styles.removed,
                            ]}
                          >
                            {shortRange(r.start, r.end)}
                            {last && cell.more > 0 ? ` +${cell.more}` : ''}
                          </Text>
                        );
                      })
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.legend}>
        {(['worked', 'live', 'missed', 'late', 'upcoming'] as CellTone[]).map((tone) => (
          <View key={tone} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: tone === 'live' ? colors.info : TONE[tone].color }]} />
            <Text variant={typography.caption} style={styles.muted}>
              {TONE[tone].label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** What a screen reader says for a cell, with full times. */
function cellLabel(name: string, cell: GridCell, today: string): string {
  const day = format(parseISO(cell.date), 'EEEE, MMM d');
  if (cell.rows.length === 0) {
    return `${name}, ${day}: no shifts. ${cell.date >= today ? 'Add a shift.' : `Open ${name}'s week.`}`;
  }
  const shifts = cell.rows
    .map((r) => `${formatTime(r.start)} to ${formatTime(r.end)}, ${TONE[cellTone(r.status)].label.toLowerCase()}`)
    .join('; ');
  return `${name}, ${day}: ${shifts}`;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
  },
  headerRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayHead: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: {
    backgroundColor: colors.primarySoft,
  },
  todayText: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  todayColumn: {
    backgroundColor: colors.primaryFaint,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
  name: {
    justifyContent: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  nameText: {
    color: colors.primary,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  time: {
    lineHeight: 18,
    paddingHorizontal: 3,
  },
  live: {
    backgroundColor: colors.info,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  removed: {
    textDecorationLine: 'line-through',
  },
  empty: {
    color: colors.disabled,
    fontSize: fontSize.lg,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.sm,
  },
  muted: {
    color: colors.textSecondary,
  },
});
