import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

admin.initializeApp();
const db = admin.firestore();
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

// Trigger when homework is created
export const onHomeworkCreated = functions.firestore
  .document('homework/{homeworkId}')
  .onCreate(async (snap, context) => {
    const homework = snap.data();
    const studentId = homework.studentId;
    const homeworkTitle = homework.title;

    try {
      // Get student document
      const studentDoc = await db.collection('students').doc(studentId).get();
      if (!studentDoc.exists) {
        console.log('Student not found:', studentId);
        return null;
      }

      const student = studentDoc.data() as Student;
      const studentName = `${student.firstName} ${student.lastName}`;

      // Get parent user IDs from the student's parents array
      const parentUserIds = student.parents
        .filter((p) => p.inviteStatus === 'accepted' && p.userId)
        .map((p) => p.userId as string);

      if (parentUserIds.length === 0) {
        console.log('No accepted parents found for student:', studentId);
        return null;
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
        return null;
      }

      // Create notification messages
      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default' as const,
        title: 'New Homework Assigned',
        body: `${studentName} has new homework: ${homeworkTitle}`,
        data: {
          type: 'homework',
          homeworkId: context.params.homeworkId,
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
      return null;
    } catch (error) {
      console.error('Error in onHomeworkCreated:', error);
      return null;
    }
  });
