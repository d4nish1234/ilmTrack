import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

initializeApp();
const db = getFirestore();
const expo = new Expo();

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
