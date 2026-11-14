import React from 'react';
import { HelpAndSupportScreen, type Faq, type GuideStep } from '../../../src/components/settings/HelpAndSupportScreen';

const STEPS: GuideStep[] = [
  { title: 'Get Invited', text: 'Your child\'s teacher adds your email when registering your child' },
  { title: 'Sign Up', text: 'Create an account with the same email and verify it' },
  { title: 'Stay Connected', text: 'View homework, attendance, and receive notifications' },
];

const FAQS: Faq[] = [
  {
    question: 'How do I get linked to my child?',
    answer: 'Your child\'s teacher will add your email address when they register your child. You\'ll receive an invitation email. Once you sign up with that same email and verify it, you\'ll automatically be linked to your child.',
  },
  {
    question: 'I signed up but don\'t see my child',
    answer: 'Make sure you signed up with the same email address that your child\'s teacher used. If you\'re still not linked, try pulling down to refresh on the Home screen, or contact your child\'s teacher to verify the email.',
  },
  {
    question: 'How do I view homework assignments?',
    answer: 'Tap the Homework tab to see all homework assigned to your children. If you have multiple children, you can filter by child using the chips at the top.',
  },
  {
    question: 'How do I check attendance?',
    answer: 'Tap the Attendance tab to view your child\'s attendance history. You\'ll see dates marked as present, absent, late, or excused.',
  },
  {
    question: 'What do the homework statuses mean?',
    answer: 'Assigned = homework is pending, Completed = your child finished the work, Incomplete = the work was not completed, Late = completed but turned in late.',
  },
  {
    question: 'What do the star ratings mean?',
    answer: 'Teachers can give 1-5 star evaluations on completed homework. 5 stars = Outstanding, 4 = Very Good, 3 = Good, 2 = Needs Improvement, 1 = Unsatisfactory.',
  },
  {
    question: 'Can I have multiple children in the app?',
    answer: 'Yes! If a teacher adds multiple children with your email, they\'ll all appear in your account. Use the filter chips to view homework or attendance for a specific child.',
  },
  {
    question: 'How do I enable notifications?',
    answer: 'Go to Settings and toggle on Notifications. You\'ll receive alerts when new homework is assigned or attendance is marked.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Go to Settings and scroll to the Danger Zone section at the bottom. Tap "Delete Account". After deletion, you can create a new account if needed (for example, if you accidentally signed up as a parent instead of a teacher).',
  },
];

export default function ParentHelpScreen() {
  return (
    <HelpAndSupportScreen
      guideTitle="Getting Started"
      steps={STEPS}
      faqs={FAQS}
      supportText="If you have questions or issues not covered here, please contact your child's teacher or reach out to our support team."
    />
  );
}
