import { describe, it, expect } from 'vitest';
import {
  computeStudentSummaries,
  buildAttendanceRows,
  buildHomeworkRows,
  generateSummaryHtml,
  generateAttendanceHtml,
  generateHomeworkHtml,
} from '../src/utils/reportUtils';
import type { Student, Attendance, Homework } from '../src/types';

// Build a Firestore-Timestamp-shaped object from a Date.
const ts = (d: Date) => ({ toDate: () => d } as any);

const mkStudent = (id: string, first = 'First', last = 'Last'): Student =>
  ({
    id,
    firstName: first,
    lastName: last,
    classId: 'c1',
    teacherId: 't1',
    parents: [],
  } as unknown as Student);

// Use local-time constructor (Y, M, D) rather than ISO strings, so date-fns'
// local-time formatting in `buildAttendanceRows` is timezone-stable in tests.
const mkAttendance = (
  studentId: string,
  status: 'present' | 'absent' | 'late' | 'excused',
  date = new Date(2026, 0, 1),
  notes?: string
): Attendance =>
  ({
    id: `att-${studentId}-${date.toISOString()}-${status}`,
    studentId,
    classId: 'c1',
    teacherId: 't1',
    date: ts(date),
    status,
    notes,
    createdAt: ts(date),
    updatedAt: ts(date),
  } as Attendance);

const mkHomework = (
  studentId: string,
  status: 'assigned' | 'completed' | 'late' | 'incomplete',
  opts: { evaluation?: 1 | 2 | 3 | 4 | 5; title?: string; createdAt?: Date } = {}
): Homework =>
  ({
    id: `hw-${studentId}-${status}-${opts.title || ''}`,
    studentId,
    classId: 'c1',
    teacherId: 't1',
    title: opts.title || 'HW',
    status,
    evaluation: opts.evaluation,
    createdAt: ts(opts.createdAt || new Date(2026, 0, 1)),
  } as Homework);

describe('computeStudentSummaries', () => {
  it('returns empty array when no students', () => {
    expect(computeStudentSummaries([], [], [])).toEqual([]);
  });

  it('handles a student with no attendance/homework (zero-division safe)', () => {
    const summaries = computeStudentSummaries([mkStudent('s1', 'A', 'A')], [], []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      studentName: 'A A',
      totalStars: 0,
      averageStars: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalHomework: 0,
    });
  });

  it('counts present/absent independently; late/excused contribute to neither', () => {
    const s = mkStudent('s1');
    const att = [
      mkAttendance('s1', 'present'),
      mkAttendance('s1', 'present', new Date(2026, 0, 2)),
      mkAttendance('s1', 'absent', new Date(2026, 0, 3)),
      mkAttendance('s1', 'late', new Date(2026, 0, 4)),
      mkAttendance('s1', 'excused', new Date(2026, 0, 5)),
    ];
    const [summary] = computeStudentSummaries([s], att, []);
    expect(summary.totalPresent).toBe(2);
    expect(summary.totalAbsent).toBe(1);
  });

  it('averages stars only over evaluated homework', () => {
    const s = mkStudent('s1');
    const hw = [
      mkHomework('s1', 'completed', { evaluation: 5 }),
      mkHomework('s1', 'completed', { evaluation: 3, title: 'B' }),
      mkHomework('s1', 'assigned'), // unevaluated — must not skew average
    ];
    const [summary] = computeStudentSummaries([s], [], hw);
    expect(summary.totalStars).toBe(8);
    expect(summary.averageStars).toBe(4); // (5+3)/2
    expect(summary.totalHomework).toBe(3);
    expect(summary.assignedHomework).toBe(1);
    expect(summary.completedHomework).toBe(2);
  });

  it('buckets homework by status', () => {
    const s = mkStudent('s1');
    const hw = [
      mkHomework('s1', 'assigned'),
      mkHomework('s1', 'completed', { title: 'b' }),
      mkHomework('s1', 'late', { title: 'c' }),
      mkHomework('s1', 'late', { title: 'd' }),
      mkHomework('s1', 'incomplete', { title: 'e' }),
    ];
    const [summary] = computeStudentSummaries([s], [], hw);
    expect(summary.assignedHomework).toBe(1);
    expect(summary.completedHomework).toBe(1);
    expect(summary.lateHomework).toBe(2);
    expect(summary.incompleteHomework).toBe(1);
  });

  it('sorts summaries alphabetically by full name', () => {
    const students = [
      mkStudent('s1', 'Zara', 'Z'),
      mkStudent('s2', 'Alice', 'A'),
      mkStudent('s3', 'Mike', 'M'),
    ];
    const summaries = computeStudentSummaries(students, [], []);
    expect(summaries.map((s) => s.studentName)).toEqual(['Alice A', 'Mike M', 'Zara Z']);
  });

  it("only attributes attendance/homework to the student it belongs to", () => {
    const students = [mkStudent('s1', 'A', 'A'), mkStudent('s2', 'B', 'B')];
    const att = [
      mkAttendance('s1', 'present'),
      mkAttendance('s2', 'absent'),
      mkAttendance('s2', 'absent', new Date(2026, 0, 2)),
    ];
    const summaries = computeStudentSummaries(students, att, []);
    const a = summaries.find((s) => s.studentName === 'A A')!;
    const b = summaries.find((s) => s.studentName === 'B B')!;
    expect(a.totalPresent).toBe(1);
    expect(a.totalAbsent).toBe(0);
    expect(b.totalAbsent).toBe(2);
    expect(b.totalPresent).toBe(0);
  });
});

describe('buildAttendanceRows', () => {
  it('sorts by date ascending and formats date as yyyy-MM-dd', () => {
    const att = [
      mkAttendance('s1', 'present', new Date('2026-03-15T10:00:00Z')),
      mkAttendance('s1', 'absent', new Date('2026-01-02T10:00:00Z')),
      mkAttendance('s1', 'late', new Date('2026-02-10T10:00:00Z')),
    ];
    const rows = buildAttendanceRows(att, new Map([['s1', 'Alice']]));
    expect(rows.map((r) => r.date)).toEqual(['2026-01-02', '2026-02-10', '2026-03-15']);
    expect(rows.every((r) => r.student === 'Alice')).toBe(true);
  });

  it('falls back to "Unknown" when student is missing from the map', () => {
    const att = [mkAttendance('ghost', 'present')];
    const rows = buildAttendanceRows(att, new Map());
    expect(rows[0].student).toBe('Unknown');
  });

  it('handles missing notes as empty string', () => {
    const rows = buildAttendanceRows([mkAttendance('s1', 'present')], new Map([['s1', 'A']]));
    expect(rows[0].notes).toBe('');
  });
});

describe('buildHomeworkRows', () => {
  it('sorts by createdAt and maps evaluation through EVALUATION_LABELS', () => {
    const hw = [
      mkHomework('s1', 'completed', {
        evaluation: 5,
        title: 'late',
        createdAt: new Date(2026, 1, 1),
      }),
      mkHomework('s1', 'assigned', { title: 'first', createdAt: new Date(2026, 0, 1) }),
    ];
    const rows = buildHomeworkRows(hw, new Map([['s1', 'Alice']]));
    expect(rows.map((r) => r.title)).toEqual(['first', 'late']);
    expect(rows[0].evaluation).toBe(''); // unevaluated
    expect(rows[1].evaluation).not.toBe(''); // mapped via EVALUATION_LABELS
  });

  it('does not mutate the input array', () => {
    const hw = [
      mkHomework('s1', 'completed', { title: 'b', createdAt: new Date(2026, 1, 1) }),
      mkHomework('s1', 'assigned', { title: 'a', createdAt: new Date(2026, 0, 1) }),
    ];
    const titlesBefore = hw.map((h) => h.title);
    buildHomeworkRows(hw, new Map());
    expect(hw.map((h) => h.title)).toEqual(titlesBefore);
  });
});

describe('HTML generators', () => {
  it('generateSummaryHtml includes student rows and totals', () => {
    const summaries = computeStudentSummaries(
      [mkStudent('s1', 'A', 'A')],
      [mkAttendance('s1', 'present'), mkAttendance('s1', 'absent', new Date(2026, 0, 2))],
      [mkHomework('s1', 'completed', { evaluation: 4 })]
    );
    const html = generateSummaryHtml(
      summaries,
      'Class 1',
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );
    expect(html).toContain('Class 1 - Class Summary Report');
    expect(html).toContain('A A');
    expect(html).toContain('Totals / Avg');
  });

  it('generateAttendanceHtml renders one row per record', () => {
    const rows = buildAttendanceRows(
      [
        mkAttendance('s1', 'present', new Date(2026, 0, 1)),
        mkAttendance('s1', 'absent', new Date(2026, 0, 2)),
      ],
      new Map([['s1', 'Alice']])
    );
    const html = generateAttendanceHtml(rows, 'C', new Date(2026, 0, 1), new Date(2026, 0, 31));
    expect(html).toContain('Alice');
    expect(html).toContain('2026-01-01');
    expect(html).toContain('2026-01-02');
  });

  it('generateHomeworkHtml renders title + status', () => {
    const rows = buildHomeworkRows(
      [mkHomework('s1', 'completed', { title: 'Read surah', evaluation: 5 })],
      new Map([['s1', 'Alice']])
    );
    const html = generateHomeworkHtml(rows, 'C', new Date(2026, 0, 1), new Date(2026, 0, 31));
    expect(html).toContain('Read surah');
    expect(html).toContain('completed');
    expect(html).toContain('Alice');
  });
});
