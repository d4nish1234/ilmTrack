import { describe, it, expect } from 'vitest';
import {
  buildAttendanceRows,
  buildHomeworkRows,
  computeStudentSummaries,
  generateAttendanceHtml,
  generateHomeworkHtml,
  generateSummaryHtml,
} from '../src/utils/reportUtils';
import { timesheetHtml } from '../src/utils/timesheetExport';
import type { TimesheetRow } from '../src/utils/timesheet';
import type { Attendance, Homework, Student } from '../src/types';

/**
 * The exported PDFs are black, greys and the status colours: no blue at all
 * (a request: they print on black-and-white printers and are read on paper).
 * The PDF builders are exempt from the theme guard test, so this keeps them
 * that way.
 */

const NAMED_BLUES = /\b(blue|navy|indigo|teal|cyan|aqua|purple|violet|slateblue|royalblue|steelblue|dodgerblue)\b/i;

/** Every colour written in the HTML, as [r, g, b]. */
function coloursIn(html: string): { text: string; rgb: [number, number, number] }[] {
  const found: { text: string; rgb: [number, number, number] }[] = [];
  for (const m of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    const n = parseInt(hex, 16);
    found.push({ text: m[0], rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] });
  }
  for (const m of html.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
    found.push({ text: m[0], rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  return found;
}

/** A colour with some saturation whose hue is between cyan and violet. */
function isBlue([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.05) return false; // black, white and greys (even a faint tint counts)
  const d = max - min;
  const hue =
    max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240;
  return hue >= 180 && hue <= 300;
}

function blueIn(html: string): string[] {
  const named = html.match(new RegExp(`(?:color|background|border)[^;:]*:[^;]*${NAMED_BLUES.source}`, 'gi')) ?? [];
  return [...coloursIn(html).filter((c) => isBlue(c.rgb)).map((c) => c.text), ...named];
}

const ts = (d: Date) => ({ toDate: () => d }) as never;
const student = { id: 's1', firstName: 'Ali', lastName: 'Khan', classId: 'c1', teacherId: 't1', parents: [] } as unknown as Student;
const day = new Date(2026, 0, 1);
const attendance = (['present', 'absent', 'late', 'excused'] as const).map(
  (status, i) =>
    ({ id: `a${i}`, studentId: 's1', classId: 'c1', teacherId: 't1', date: ts(day), status, createdAt: ts(day) }) as unknown as Attendance
);
const homework = (['assigned', 'completed', 'late', 'incomplete'] as const).map(
  (status, i) =>
    ({ id: `h${i}`, studentId: 's1', classId: 'c1', teacherId: 't1', title: 'Read', status, evaluation: 4, createdAt: ts(day) }) as unknown as Homework
);
const row = (status: TimesheetRow['status'], extra: Partial<TimesheetRow> = {}): TimesheetRow => ({
  shiftId: `s-${status}`,
  date: '2026-11-02',
  start: '16:00',
  end: '18:00',
  locationName: 'Main campus',
  removed: false,
  entry: null,
  status,
  scheduledMinutes: 120,
  workedMinutes: status === 'worked' ? 110 : 0,
  workedFrom: status === 'worked' ? '16:05' : null,
  workedTo: status === 'worked' ? '17:55' : null,
  ...extra,
});

describe('PDF colours', () => {
  it('the check itself spots blue and indigo, and passes greys and status colours', () => {
    expect(blueIn('h1 { color: #1a73e8; } th { background: #e8f0fe; } a { color: #2c2e78 }')).toHaveLength(3);
    expect(blueIn('th { border-bottom: 2px solid blue; }')).toHaveLength(1);
    expect(blueIn('body { color: #333; } .x { color: #f0f0f0; color: #1e7e34; color: #d32f2f; color: #e65100 }')).toEqual(
      []
    );
  });

  it('class reports have no blue', () => {
    const summaries = computeStudentSummaries([student], attendance, homework);
    const names = new Map([['s1', 'Ali Khan']]);
    for (const html of [
      generateSummaryHtml(summaries, 'Class 1', day, day),
      generateAttendanceHtml(buildAttendanceRows(attendance, names), 'Class 1', day, day),
      generateHomeworkHtml(buildHomeworkRows(homework, names), 'Class 1', day, day),
    ]) {
      expect(blueIn(html)).toEqual([]);
    }
  });

  it('the timesheet has no blue', () => {
    const entry = { note: 'Covered', correction: { reason: 'Forgot to end' } } as unknown as TimesheetRow['entry'];
    const html = timesheetHtml({
      orgName: 'Test School',
      range: { from: '2026-11-02', to: '2026-11-08' },
      timezone: 'America/Toronto',
      preparedAt: 'Nov 13, 2026, 4:05 PM',
      people: [
        {
          teacher: { uid: 't1', name: 'Aisha', email: 'a@example.com' },
          rows: [
            row('worked', { entry, removed: true }),
            row('not-started'),
            row('upcoming'),
            row('late'),
            row('running'),
            row('paused'),
          ],
        },
        { teacher: { uid: 't2', name: 'Omar', email: '' }, rows: [] },
      ],
    });
    expect(blueIn(html)).toEqual([]);
  });
});
