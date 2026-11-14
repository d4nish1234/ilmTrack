import React from 'react';
import { HelpAndSupportScreen, type Faq, type GuideStep } from '../../../src/components/settings/HelpAndSupportScreen';

const STEPS: GuideStep[] = [
  { title: 'Create a Class', text: 'On the Classes tab, open the class picker at the top and choose + Create New Class' },
  { title: 'Add Students', text: "Tap + and add each student with a parent's email, so parents can follow along" },
  { title: 'Track Daily', text: "Swipe a student's card to mark attendance or give homework" },
];

const FAQS: Faq[] = [
  {
    question: 'How do I add a student to my class?',
    answer:
      "On the Classes tab, pick the class and tap the + button. Enter a parent's email first: if they already have children in your classes, you can add to that family. Otherwise, enter the student's and parent's details.",
  },
  {
    question: 'How do I mark attendance?',
    answer:
      "On the Classes tab, swipe a student's card to the left and tap Mark Present (or Mark Absent if they're already marked present). For late or excused, or another day, open the student and tap Add Attendance.",
  },
  {
    question: 'How do I give and check homework?',
    answer:
      "On the Classes tab, swipe a student's card to the right. Tap New to give homework, or Evaluate to rate it and mark it complete, late or incomplete. You can also open the student and tap Add Homework.",
  },
  {
    question: 'How do parents get notified?',
    answer:
      "When you add a student, the parent gets an invitation email. Once they sign up with that email and verify it, they're linked to their child and can see homework and attendance, with notifications if they turn them on.",
  },
  {
    question: 'Can I have more than one class?',
    answer: 'Yes. Open the class picker at the top of the Classes tab and choose + Create New Class. Use the same picker to switch between classes.',
  },
  {
    question: 'How do I edit or delete a class?',
    answer:
      'On the Classes tab, tap the ⋮ menu at the top and choose Edit Class. There you can change its details, add co-teachers, or delete the class.',
  },
  {
    question: 'Can I share a class with another teacher?',
    answer:
      "Yes. Edit the class and add the other teacher as a co-teacher by email. They can then manage the class's students, homework and attendance.",
  },
  {
    question: 'How do I get reports?',
    answer: 'On the Classes tab, tap the ⋮ menu and choose Reports. Pick the dates, open a report to preview it, and export it as a PDF.',
  },
  {
    question: 'How do I start and end my shifts?',
    answer:
      "If your organization uses timekeeping, a Time bar shows on the Classes tab. Tap it to start a shift when you arrive (ilmTrack checks you're at your school), take a break, and end the shift when you leave.",
  },
  {
    question: 'I forgot to start or end a shift. What do I do?',
    answer:
      "Ask your organization's admin. They can correct your hours, or add them for a shift you didn't start, and the reason is kept with your record.",
  },
  {
    question: 'How do I manage timekeeping for my organization?',
    answer:
      "If you're an organization admin, open the Organization tab and tap Timekeeping. Tap How timekeeping works there for a quick guide to locations, schedules, the week view and exporting timesheets.",
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Go to Settings and scroll to Danger Zone at the bottom, then tap Delete Account. Classes you own and their records are permanently deleted, and you are removed as a co-teacher from shared classes.',
  },
];

export default function TeacherHelpScreen() {
  return (
    <HelpAndSupportScreen
      guideTitle="Quick Start Guide"
      steps={STEPS}
      faqs={FAQS}
      supportText="If you have questions or issues not covered here, please reach out to our support team."
    />
  );
}
