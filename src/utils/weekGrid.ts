/**
 * The Timekeeping screen's week grid (people by day): which days to show,
 * what each cell says, and how tall each person's row is. Pure, so it is
 * unit-tested (tests/weekGrid.test.ts). The grid itself is
 * src/components/timekeeping/WeekGrid.tsx.
 */
import { format } from 'date-fns';
import type { RowStatus, TimesheetRow } from './timesheet';

/** Times shown in one cell before the rest become "+N". */
export const CELL_TIMES_MAX = 2;

/** '16:00' → '4', '16:30' → '4:30', '00:00' → '12'. No AM/PM: a cell is narrow. */
export function shortTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}` : `${hour}:${String(m).padStart(2, '0')}`;
}

/** '4–6', '4:30–6', '9–1'. */
export const shortRange = (start: string, end: string) => `${shortTime(start)}–${shortTime(end)}`;

export interface GridCell {
  date: string;
  /** Up to CELL_TIMES_MAX of the day's shifts, in time order. */
  shown: TimesheetRow[];
  /** How many more there are. */
  more: number;
  /** All of the day's shifts. */
  rows: TimesheetRow[];
}

/** One person's cells, one per date. `rows` is their week (timesheetRows). */
export function gridCells(rows: TimesheetRow[], dates: string[]): GridCell[] {
  return dates.map((date) => {
    const day = rows.filter((r) => r.date === date).sort((a, b) => a.start.localeCompare(b.start));
    return { date, rows: day, shown: day.slice(0, CELL_TIMES_MAX), more: Math.max(0, day.length - CELL_TIMES_MAX) };
  });
}

/** Lines a person's row needs: the most times shown in any of their cells (at least 1). */
export const rowLines = (cells: GridCell[]) => Math.max(1, ...cells.map((c) => c.shown.length));

/** Height of one line of times in a cell, and the padding around them. */
const LINE_HEIGHT = 18;
const ROW_PADDING = 14;
/** Every row is at least a comfortable tap target, and fits a two-line name. */
export const ROW_MIN_HEIGHT = 44;

/** A person's row height in the grid. */
export const rowHeight = (cells: GridCell[]) => Math.max(ROW_MIN_HEIGHT, rowLines(cells) * LINE_HEIGHT + ROW_PADDING);

/**
 * The week's dates to show as columns: Monday to Friday always, Saturday and
 * Sunday only when someone has a shift then, so a weekday school gets wider
 * columns.
 */
export function gridDates(weekDates: string[], allRows: TimesheetRow[]): string[] {
  const used = new Set(allRows.map((r) => r.date));
  return weekDates.filter((date, i) => i < 5 || used.has(date));
}

/** How a time in a cell reads at a glance. */
export type CellTone = 'worked' | 'live' | 'missed' | 'late' | 'upcoming';

export function cellTone(status: RowStatus): CellTone {
  switch (status) {
    case 'worked':
      return 'worked';
    case 'running':
    case 'paused':
      return 'live';
    case 'not-started':
      return 'missed';
    case 'late':
      return 'late';
    default:
      return 'upcoming';
  }
}

/** The week pager's label: 'Nov 9 – 15', 'Nov 30 – Dec 6', 'Dec 28 – Jan 3, 2027'. */
export function weekRangeLabel(weekStart: string, thisYear: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12);
  const end = new Date(y, m - 1, d + 6, 12);
  const month = (date: Date) => format(date, 'MMM');
  const startText = `${month(start)} ${start.getDate()}`;
  const endText =
    start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${month(end)} ${end.getDate()}`;
  const year = end.getFullYear() !== thisYear || start.getFullYear() !== thisYear ? `, ${end.getFullYear()}` : '';
  return `${startText} – ${endText}${year}`;
}
