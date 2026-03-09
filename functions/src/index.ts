import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Resend } from 'resend';

initializeApp();
const db = getFirestore();
const expo = new Expo();

// Resend client — initialised lazily so missing keys don't crash unrelated functions
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — email sending disabled');
    return null;
  }
  return new Resend(apiKey);
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'noreply@ilmtrack.app';
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error('Email send failed (silent):', error);
      return;
    }
    console.log(`Email sent: ${data?.id}`);
  } catch (error) {
    // Silently fail — email is best-effort and free tier limits apply
    console.error('Email send failed (silent):', error);
  }
}

interface Parent {
  email: string;
  userId?: string;
  inviteStatus: string;
}

interface Student {
  firstName: string;
  lastName: string;
  parents: Parent[];
}

interface User {
  expoPushToken?: string;
  firstName: string;
  lastName: string;
}

interface HomeworkData {
  studentId: string;
  title: string;
}

// Trigger when homework is created (v2)
export const notifyParentsOnHomework = onDocumentCreated(
  'homework/{homeworkId}',
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log('No data in event');
      return;
    }

    const homework = snap.data() as HomeworkData;
    const studentId = homework.studentId;
    const homeworkTitle = homework.title;
    const homeworkId = event.params.homeworkId;

    try {
      // Get student document
      const studentDoc = await db.collection('students').doc(studentId).get();
      if (!studentDoc.exists) {
        console.log('Student not found:', studentId);
        return;
      }

      const student = studentDoc.data() as Student;
      const studentName = `${student.firstName} ${student.lastName}`;

      // Get parent user IDs from the student's parents array
      const parentUserIds = student.parents
        .filter((p) => p.inviteStatus === 'accepted' && p.userId)
        .map((p) => p.userId as string);

      if (parentUserIds.length === 0) {
        console.log('No accepted parents found for student:', studentId);
        return;
      }

      // Get push tokens for all parents
      const pushTokens: string[] = [];
      for (const userId of parentUserIds) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const user = userDoc.data() as User;
          if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
            pushTokens.push(user.expoPushToken);
          }
        }
      }

      if (pushTokens.length === 0) {
        console.log('No valid push tokens found for parents');
        return;
      }

      // Create notification messages
      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default' as const,
        title: 'New Homework Assigned',
        body: `${studentName} has new homework: ${homeworkTitle}`,
        data: {
          type: 'homework',
          homeworkId,
          studentId,
        },
        channelId: 'homework',
      }));

      // Send notifications in chunks
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log('Notification tickets:', ticketChunk);
        } catch (error) {
          console.error('Error sending notification chunk:', error);
        }
      }

      console.log(`Sent ${pushTokens.length} notifications for homework: ${homeworkTitle}`);
    } catch (error) {
      console.error('Error in onHomeworkCreated:', error);
    }
  }
);

interface InviteData {
  email: string;
  studentId: string;
  teacherId: string;
}

// Send a parent invite email when an invite document is created
export const sendParentInviteEmail = onDocumentCreated(
  'invites/{inviteId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const invite = snap.data() as InviteData;

    try {
      // Fetch student name
      const studentDoc = await db.collection('students').doc(invite.studentId).get();
      const studentName = studentDoc.exists
        ? `${studentDoc.data()!.firstName} ${studentDoc.data()!.lastName}`
        : 'your child';

      // Fetch teacher name
      const teacherDoc = await db.collection('users').doc(invite.teacherId).get();
      const teacherName = teacherDoc.exists
        ? `${teacherDoc.data()!.firstName} ${teacherDoc.data()!.lastName}`
        : 'Your teacher';

      await sendEmail({
        to: invite.email,
        subject: `You've been invited to view ${studentName}'s progress on IlmTrack`,
        html: `
          <p>Assalamu Alaikum,</p>
          <p>${teacherName} has added you as a parent/guardian for <strong>${studentName}</strong> on IlmTrack.</p>
          <p>IlmTrack lets you view your child's homework assignments and attendance records.</p>
          <p>To get started, download the IlmTrack app and sign up with this email address (<strong>${invite.email}</strong>).</p>
          <p>Once you sign in, ${studentName}'s records will appear automatically.</p>
          <br/>
          <p>JazakAllah Khair,<br/>The IlmTrack Team</p>
        `,
      });

      console.log(`Invite email sent to ${invite.email} for student ${invite.studentId}`);
    } catch (error) {
      console.error('Error in sendParentInviteEmail:', error);
    }
  }
);

interface NewUserData {
  role: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Notify admin when a new teacher account is created
export const notifyAdminOnTeacherSignup = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const newUser = snap.data() as NewUserData;
    if (newUser.role !== 'teacher') return;

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.warn('ADMIN_EMAIL not set — skipping admin notification');
      return;
    }

    const teacherName = `${newUser.firstName} ${newUser.lastName}`;
    const teacherEmail = newUser.email;

    await sendEmail({
      to: adminEmail,
      subject: `New teacher signed up on IlmTrack: ${teacherName}`,
      html: `
        <p>A new teacher account has been created on IlmTrack.</p>
        <ul>
          <li><strong>Name:</strong> ${teacherName}</li>
          <li><strong>Email:</strong> ${teacherEmail}</li>
        </ul>
        <p>No action is required. This is an informational notification.</p>
      `,
    });

    console.log(`Admin notified of new teacher signup: ${teacherEmail}`);
  }
);
