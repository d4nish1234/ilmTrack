import React from 'react';
import { HelpAndSupportScreen, type Faq, type GuideStep } from '../../../src/components/settings/HelpAndSupportScreen';

const STEPS: GuideStep[] = [
  { title: 'Create a Class', text: 'Tap the Classes tab and create your first class' },
  { title: 'Add Students', text: 'Add students with their parent\'s email for notifications' },
  { title: 'Track Daily', text: 'Use swipe gestures to mark attendance and assign homework' },
];

const FAQS: Faq[] = [
  {
    question: 'How do I add a student to my class?',
    answer: 'Go to the Classes tab, select a class, then tap the + button. Enter the parent\'s email to check if they already have children in your classes, or add a new student with their parent\'s information.',
  },
  {
    question: 'How do I mark attendance?',
    answer: 'From the Home tab, swipe right on a student\'s card to toggle their attendance status. You can mark students as present, absent, late, or excused.',
  },
  {
    question: 'How do I assign homework?',
    answer: 'From the Home tab, swipe left on a student\'s card to assign homework. Enter the title and optional description, then tap Assign.',
  },
  {
    question: 'How do parents get notified?',
    answer: 'When you add a student, an invitation email is sent to the parent\'s email address. Once they sign up and verify their email, they\'ll be automatically linked to their child and can view homework and attendance.',
  },
  {
    question: 'Can I add multiple classes?',
    answer: 'Yes! Use the class dropdown at the top of the Home or Classes tab and select "+ Create New Class" to add additional classes.',
  },
  {
    question: 'How do I edit or delete a class?',
    answer: 'Go to the Classes tab, tap the three-dot menu next to the class dropdown, and select "Edit Class". From there you can edit class details, manage admins, or delete the class.',
  },
  {
    question: 'Can I share class management with another teacher?',
    answer: 'Yes! Edit a class and add another teacher as an admin by entering their email. They\'ll have access to manage students, homework, and attendance for that class.',
  },
  {
    question: 'How do I export reports?',
    answer: 'Go to the Classes tab, tap the three-dot menu, and select "Reports". Choose a date range, preview a report, and export it as a PDF.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Go to Settings and scroll to the Danger Zone section at the bottom. Tap "Delete Account". All classes you own and their data will be permanently deleted. You will also be removed as a co-teacher from any shared classes.',
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
