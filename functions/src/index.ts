import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
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

// Send a teacher invite email when an admin invite document is created
export const sendTeacherInviteEmail = onDocumentCreated(
  'adminInvites/{inviteId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const invite = snap.data();
    const email = invite.email as string;
    const classId = invite.classId as string;

    if (!email || !classId) return;

    try {
      // Fetch class name and owner
      const classDoc = await db.collection('classes').doc(classId).get();
      const className = classDoc.exists ? classDoc.data()!.name : 'a class';
      const teacherId = classDoc.exists ? classDoc.data()!.teacherId : null;

      let ownerName = 'A teacher';
      if (teacherId) {
        const ownerDoc = await db.collection('users').doc(teacherId).get();
        if (ownerDoc.exists) {
          ownerName = `${ownerDoc.data()!.firstName} ${ownerDoc.data()!.lastName}`;
        }
      }

      await sendEmail({
        to: email,
        subject: `You've been invited to co-teach "${className}" on IlmTrack`,
        html: `
          <p>Assalamu Alaikum,</p>
          <p>${ownerName} has invited you to co-teach <strong>${className}</strong> on IlmTrack.</p>
          <p>As a co-teacher, you'll be able to view students, assign homework, and mark attendance for this class.</p>
          <p>To get started, download the IlmTrack app and sign up with this email address (<strong>${email}</strong>).</p>
          <p>Once you sign in, the class will appear automatically.</p>
          <br/>
          <p>JazakAllah Khair,<br/>The IlmTrack Team</p>
        `,
      });

      console.log(`Teacher invite email sent to ${email} for class ${classId}`);
    } catch (error) {
      console.error('Error in sendTeacherInviteEmail:', error);
    }
  }
);

interface NewUserData {
  role: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Notify admin when a teacher verifies their email address
export const notifyAdminOnTeacherSignup = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only trigger when emailVerified flips to true for the first time
    if (before.emailVerified === true || after.emailVerified !== true) return;

    const newUser = after as NewUserData;
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

// ─── Cloud Functions for invite acceptance ───────────────────────────────────

/**
 * When a parent invite is accepted (status changes to 'accepted'):
 * 1. Update the student doc's parent entry with inviteStatus: 'accepted' and userId
 * 2. Add userId to student's parentUserIds array
 * 3. Backfill parentUserIds on all homework/attendance docs for that student
 */
export const onInviteAccepted = onDocumentUpdated(
  'invites/{inviteId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only trigger when status changes to 'accepted'
    if (before.status === 'accepted' || after.status !== 'accepted') return;

    const parentUserId = after.parentId as string;
    const studentId = after.studentId as string;
    const parentEmail = (after.email as string).toLowerCase();

    if (!parentUserId || !studentId) {
      console.error('Missing parentId or studentId on accepted invite');
      return;
    }

    try {
      // 1. Update student doc: set parent's inviteStatus and userId, add to parentUserIds
      const studentRef = db.collection('students').doc(studentId);
      const studentDoc = await studentRef.get();
      if (!studentDoc.exists) {
        console.log('Student not found:', studentId);
        return;
      }

      const studentData = studentDoc.data()!;
      const parents = studentData.parents || [];
      const updatedParents = parents.map((p: Parent) => {
        if (p.email.toLowerCase() === parentEmail) {
          return { ...p, inviteStatus: 'accepted', userId: parentUserId };
        }
        return p;
      });

      await studentRef.update({
        parents: updatedParents,
        parentUserIds: FieldValue.arrayUnion(parentUserId),
      });

      // 2. Backfill parentUserIds on homework docs for this student
      const homeworkSnapshot = await db.collection('homework')
        .where('studentId', '==', studentId)
        .get();

      const batch = db.batch();
      homeworkSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          parentUserIds: FieldValue.arrayUnion(parentUserId),
        });
      });

      // 3. Backfill parentUserIds on attendance docs for this student
      const attendanceSnapshot = await db.collection('attendance')
        .where('studentId', '==', studentId)
        .get();

      attendanceSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          parentUserIds: FieldValue.arrayUnion(parentUserId),
        });
      });

      await batch.commit();

      console.log(`Invite accepted: parent ${parentUserId} linked to student ${studentId}, backfilled ${homeworkSnapshot.size} homework and ${attendanceSnapshot.size} attendance docs`);
    } catch (error) {
      console.error('Error in onInviteAccepted:', error);
    }
  }
);

/**
 * When a teacher invite is accepted (status changes to 'accepted'):
 * 1. Update the class doc's admin entry with inviteStatus: 'accepted' and userId
 * 2. Backfill invitedTeacherIds on all student/homework/attendance docs in that class
 */
export const onTeacherInviteAccepted = onDocumentUpdated(
  'adminInvites/{inviteId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only trigger when status changes to 'accepted'
    if (before.status === 'accepted' || after.status !== 'accepted') return;

    const teacherUserId = after.userId as string;
    const classId = after.classId as string;
    const teacherEmail = (after.email as string).toLowerCase();

    if (!teacherUserId || !classId) {
      console.error('Missing userId or classId on accepted admin invite');
      return;
    }

    try {
      // 1. Update class doc: set admin's inviteStatus and userId
      const classRef = db.collection('classes').doc(classId);
      const classDoc = await classRef.get();
      if (!classDoc.exists) {
        console.log('Class not found:', classId);
        return;
      }

      const classData = classDoc.data()!;
      const admins = classData.admins || [];
      const updatedAdmins = admins.map((a: { email: string; inviteStatus: string; userId?: string }) => {
        if (a.email.toLowerCase() === teacherEmail) {
          return { ...a, inviteStatus: 'accepted', userId: teacherUserId };
        }
        return a;
      });

      await classRef.update({ admins: updatedAdmins });

      // 2. Backfill invitedTeacherIds on student docs in this class
      const studentsSnapshot = await db.collection('students')
        .where('classId', '==', classId)
        .get();

      const batch = db.batch();
      studentsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          invitedTeacherIds: FieldValue.arrayUnion(teacherUserId),
        });
      });

      // 3. Backfill invitedTeacherIds on homework docs in this class
      const homeworkSnapshot = await db.collection('homework')
        .where('classId', '==', classId)
        .get();

      homeworkSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          invitedTeacherIds: FieldValue.arrayUnion(teacherUserId),
        });
      });

      // 4. Backfill invitedTeacherIds on attendance docs in this class
      const attendanceSnapshot = await db.collection('attendance')
        .where('classId', '==', classId)
        .get();

      attendanceSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          invitedTeacherIds: FieldValue.arrayUnion(teacherUserId),
        });
      });

      await batch.commit();

      console.log(`Teacher invite accepted: teacher ${teacherUserId} linked to class ${classId}, backfilled ${studentsSnapshot.size} students, ${homeworkSnapshot.size} homework, ${attendanceSnapshot.size} attendance docs`);
    } catch (error) {
      console.error('Error in onTeacherInviteAccepted:', error);
    }
  }
);

/**
 * When a teacher is removed from a class (admins array changes):
 * Remove their userId from invitedTeacherIds on all student/homework/attendance docs in that class
 */
export const onTeacherRemoved = onDocumentUpdated(
  'classes/{classId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const classId = event.params.classId;

    // Find removed admin userIds
    const beforeAdminUserIds = new Set(
      (before.admins || [])
        .filter((a: { userId?: string; inviteStatus: string }) => a.userId && a.inviteStatus === 'accepted')
        .map((a: { userId: string }) => a.userId)
    );
    const afterAdminUserIds = new Set(
      (after.admins || [])
        .filter((a: { userId?: string; inviteStatus: string }) => a.userId && a.inviteStatus === 'accepted')
        .map((a: { userId: string }) => a.userId)
    );

    // Find userIds that were removed
    const removedUserIds: string[] = [];
    beforeAdminUserIds.forEach((uid) => {
      if (!afterAdminUserIds.has(uid)) {
        removedUserIds.push(uid as string);
      }
    });

    if (removedUserIds.length === 0) return;

    try {
      const batch = db.batch();

      for (const removedUserId of removedUserIds) {
        // Remove from student docs
        const studentsSnapshot = await db.collection('students')
          .where('classId', '==', classId)
          .get();
        studentsSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            invitedTeacherIds: FieldValue.arrayRemove(removedUserId),
          });
        });

        // Remove from homework docs
        const homeworkSnapshot = await db.collection('homework')
          .where('classId', '==', classId)
          .get();
        homeworkSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            invitedTeacherIds: FieldValue.arrayRemove(removedUserId),
          });
        });

        // Remove from attendance docs
        const attendanceSnapshot = await db.collection('attendance')
          .where('classId', '==', classId)
          .get();
        attendanceSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            invitedTeacherIds: FieldValue.arrayRemove(removedUserId),
          });
        });
      }

      await batch.commit();
      console.log(`Removed teachers ${removedUserIds.join(', ')} from class ${classId} docs`);
    } catch (error) {
      console.error('Error in onTeacherRemoved:', error);
    }
  }
);
