import { Student, Attendance, Homework, EVALUATION_LABELS, HomeworkEvaluation } from '../types';
import { format } from 'date-fns';

export interface StudentSummary {
  studentName: string;
  totalStars: number;
  averageStars: number;
  totalPresent: number;
  totalAbsent: number;
  totalHomework: number;
  completedHomework: number;
  lateHomework: number;
  incompleteHomework: number;
  assignedHomework: number;
}

export function computeStudentSummaries(
  students: Student[],
  attendance: Attendance[],
  homework: Homework[]
): StudentSummary[] {
  // Group attendance by studentId
  const attendanceByStudent = new Map<string, Attendance[]>();
  for (const a of attendance) {
    const list = attendanceByStudent.get(a.studentId) || [];
    list.push(a);
    attendanceByStudent.set(a.studentId, list);
  }

  // Group homework by studentId
  const homeworkByStudent = new Map<string, Homework[]>();
  for (const h of homework) {
    const list = homeworkByStudent.get(h.studentId) || [];
    list.push(h);
    homeworkByStudent.set(h.studentId, list);
  }

  const summaries: StudentSummary[] = students.map((student) => {
    const studentAttendance = attendanceByStudent.get(student.id) || [];
    const studentHomework = homeworkByStudent.get(student.id) || [];

    const totalPresent = studentAttendance.filter((a) => a.status === 'present').length;
    const totalAbsent = studentAttendance.filter((a) => a.status === 'absent').length;

    const evaluatedHomework = studentHomework.filter((h) => h.evaluation);
    const totalStars = evaluatedHomework.reduce((sum, h) => sum + (h.evaluation || 0), 0);
    const averageStars =
      evaluatedHomework.length > 0
        ? Math.round((totalStars / evaluatedHomework.length) * 10) / 10
        : 0;

    return {
      studentName: `${student.firstName} ${student.lastName}`,
      totalStars,
      averageStars,
      totalPresent,
      totalAbsent,
      totalHomework: studentHomework.length,
      completedHomework: studentHomework.filter((h) => h.status === 'completed').length,
      lateHomework: studentHomework.filter((h) => h.status === 'late').length,
      incompleteHomework: studentHomework.filter((h) => h.status === 'incomplete').length,
      assignedHomework: studentHomework.filter((h) => h.status === 'assigned').length,
    };
  });

  return summaries.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function wrapHtml(title: string, dateRange: string, tableContent: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
    h1 { font-size: 18px; color: #1a73e8; margin-bottom: 4px; }
    h2 { font-size: 13px; color: #666; margin-top: 0; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1a73e8; color: #fff; padding: 8px 6px; text-align: center; white-space: nowrap; }
    th:first-child { text-align: left; }
    td { padding: 7px 6px; border-bottom: 1px solid #e0e0e0; text-align: center; }
    td:first-child { text-align: left; font-weight: 500; }
    tr:nth-child(even) { background: #f9f9f9; }
    .totals td { font-weight: 700; border-top: 2px solid #1a73e8; background: #e8f0fe; }
    .footer { margin-top: 16px; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <h2>${dateRange}</h2>
  ${tableContent}
  <p class="footer">Generated on ${format(new Date(), 'MMM d, yyyy')} via IlmTrack</p>
</body>
</html>`;
}

export function generateSummaryHtml(
  summaries: StudentSummary[],
  className: string,
  startDate: Date,
  endDate: Date
): string {
  const rows = summaries
    .map(
      (s) => `
    <tr>
      <td>${s.studentName}</td>
      <td>${s.totalStars}</td>
      <td>${s.averageStars}</td>
      <td>${s.totalPresent}</td>
      <td>${s.totalAbsent}</td>
      <td>${s.totalHomework}</td>
      <td>${s.completedHomework}</td>
      <td>${s.lateHomework}</td>
      <td>${s.incompleteHomework}</td>
      <td>${s.assignedHomework}</td>
    </tr>`
    )
    .join('');

  const totals = summaries.reduce(
    (acc, s) => ({
      totalStars: acc.totalStars + s.totalStars,
      totalPresent: acc.totalPresent + s.totalPresent,
      totalAbsent: acc.totalAbsent + s.totalAbsent,
      totalHomework: acc.totalHomework + s.totalHomework,
      completedHomework: acc.completedHomework + s.completedHomework,
      lateHomework: acc.lateHomework + s.lateHomework,
      incompleteHomework: acc.incompleteHomework + s.incompleteHomework,
      assignedHomework: acc.assignedHomework + s.assignedHomework,
    }),
    {
      totalStars: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalHomework: 0,
      completedHomework: 0,
      lateHomework: 0,
      incompleteHomework: 0,
      assignedHomework: 0,
    }
  );

  const overallAvgStars =
    summaries.length > 0
      ? Math.round((summaries.reduce((sum, s) => sum + s.averageStars, 0) / summaries.length) * 10) / 10
      : 0;

  const tableContent = `
  <table>
    <thead>
      <tr>
        <th>Student</th>
        <th>Total Stars</th>
        <th>Avg Stars</th>
        <th>Present</th>
        <th>Absent</th>
        <th>Total HW</th>
        <th>Completed</th>
        <th>Late</th>
        <th>Incomplete</th>
        <th>Assigned</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals">
        <td>Totals / Avg</td>
        <td>${totals.totalStars}</td>
        <td>${overallAvgStars}</td>
        <td>${totals.totalPresent}</td>
        <td>${totals.totalAbsent}</td>
        <td>${totals.totalHomework}</td>
        <td>${totals.completedHomework}</td>
        <td>${totals.lateHomework}</td>
        <td>${totals.incompleteHomework}</td>
        <td>${totals.assignedHomework}</td>
      </tr>
    </tbody>
  </table>`;

  return wrapHtml(
    `${className} - Class Summary Report`,
    `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`,
    tableContent
  );
}

export interface AttendanceRow {
  date: string;
  student: string;
  status: string;
  notes: string;
}

export function buildAttendanceRows(
  attendance: Attendance[],
  studentMap: Map<string, string>
): AttendanceRow[] {
  const sorted = [...attendance].sort((a, b) => {
    const aDate = a.date?.toDate().getTime() || 0;
    const bDate = b.date?.toDate().getTime() || 0;
    return aDate - bDate;
  });

  return sorted.map((a) => ({
    date: a.date ? format(a.date.toDate(), 'yyyy-MM-dd') : '',
    student: studentMap.get(a.studentId) || 'Unknown',
    status: a.status,
    notes: a.notes || '',
  }));
}

export function generateAttendanceHtml(
  rows: AttendanceRow[],
  className: string,
  startDate: Date,
  endDate: Date
): string {
  const tableRows = rows
    .map(
      (r) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.student}</td>
      <td>${r.status}</td>
      <td>${r.notes}</td>
    </tr>`
    )
    .join('');

  const tableContent = `
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Student</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`;

  return wrapHtml(
    `${className} - Attendance Report`,
    `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`,
    tableContent
  );
}

export interface HomeworkRow {
  date: string;
  student: string;
  title: string;
  status: string;
  evaluation: string;
  description: string;
  notes: string;
}

export function buildHomeworkRows(
  homework: Homework[],
  studentMap: Map<string, string>
): HomeworkRow[] {
  const sorted = [...homework].sort((a, b) => {
    const aDate = a.createdAt?.toDate().getTime() || 0;
    const bDate = b.createdAt?.toDate().getTime() || 0;
    return aDate - bDate;
  });

  return sorted.map((h) => ({
    date: h.createdAt ? format(h.createdAt.toDate(), 'yyyy-MM-dd') : '',
    student: studentMap.get(h.studentId) || 'Unknown',
    title: h.title,
    status: h.status,
    evaluation: h.evaluation
      ? EVALUATION_LABELS[h.evaluation as HomeworkEvaluation]
      : '',
    description: h.description || '',
    notes: h.notes || '',
  }));
}

export function generateHomeworkHtml(
  rows: HomeworkRow[],
  className: string,
  startDate: Date,
  endDate: Date
): string {
  const tableRows = rows
    .map(
      (r) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.student}</td>
      <td>${r.title}</td>
      <td>${r.status}</td>
      <td>${r.evaluation}</td>
      <td>${r.description}</td>
      <td>${r.notes}</td>
    </tr>`
    )
    .join('');

  const tableContent = `
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Student</th>
        <th>Title</th>
        <th>Status</th>
        <th>Evaluation</th>
        <th>Description</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`;

  return wrapHtml(
    `${className} - Homework Report`,
    `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`,
    tableContent
  );
}
