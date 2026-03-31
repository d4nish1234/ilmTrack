import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Linking, Alert } from 'react-native';
import { Text, List, Divider, Card, Portal, Modal, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/common';
import { getStudent } from '../../src/services/student.service';
import { Student } from '../../src/types';

const FAQ_ITEMS = [
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
    answer: 'Scroll to the Danger Zone section at the bottom of this page and tap "Delete Account". After deletion, you can create a new account if needed (for example, if you accidentally signed up as a parent instead of a teacher).',
  },
];

export default function ParentHelpScreen() {
  const { deleteAccount, user } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);

  useEffect(() => {
    const fetchLinkedStudents = async () => {
      if (!user?.studentIds?.length) {
        setLinkedStudents([]);
        return;
      }
      const students: Student[] = [];
      for (const id of user.studentIds) {
        try {
          const s = await getStudent(id);
          if (s) students.push(s);
        } catch {
          // Skip students that can't be fetched
        }
      }
      setLinkedStudents(students);
    };
    fetchLinkedStudents();
  }, [user?.studentIds]);

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }

    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
    } catch (error: any) {
      console.error('Delete account error:', error);
      if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        Alert.alert('Incorrect Password', 'The password you entered is incorrect. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete account. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteConfirm = () => {
    setDeletePassword('');
    setShowDeleteConfirm(true);
  };

  const handleEmailSupport = async () => {
    const url = 'mailto:info@youngmomins.com?subject=ilmTrack%20Support%20Request';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('Contact Support', 'Email us at info@youngmomins.com');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Help & Support',
          headerShown: true,
          headerStyle: { backgroundColor: '#1a73e8' },
          headerTintColor: '#fff',
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Quick Start Guide */}
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Getting Started
              </Text>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>1</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Get Invited</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    Your child&apos;s teacher adds your email when registering your child
                  </Text>
                </View>
              </View>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>2</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Sign Up</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    Create an account with the same email and verify it
                  </Text>
                </View>
              </View>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>3</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Stay Connected</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    View homework, attendance, and receive notifications
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* FAQ Section */}
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Frequently Asked Questions
          </Text>

          <List.AccordionGroup>
            {FAQ_ITEMS.map((item, index) => (
              <List.Accordion
                key={index}
                id={String(index)}
                title={item.question}
                titleNumberOfLines={2}
                style={styles.accordion}
              >
                <View style={styles.answerContainer}>
                  <Text variant="bodyMedium" style={styles.answer}>
                    {item.answer}
                  </Text>
                </View>
              </List.Accordion>
            ))}
          </List.AccordionGroup>

          <Divider style={styles.divider} />

          {/* Contact Support */}
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Need More Help?
          </Text>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="bodyMedium" style={styles.supportText}>
                If you have questions or issues not covered here, please contact your child&apos;s teacher or reach out to our support team.
              </Text>
              <List.Item
                title="Email Support"
                description="info@youngmomins.com"
                left={(props) => <List.Icon {...props} icon="email" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={handleEmailSupport}
                style={styles.contactItem}
              />
            </Card.Content>
          </Card>

          <Divider style={styles.divider} />

          {/* Danger Zone */}
          <View style={styles.dangerZone}>
            <Text variant="titleMedium" style={styles.dangerTitle}>
              Danger Zone
            </Text>
            <Text variant="bodySmall" style={styles.dangerNote}>
              Permanently delete your account and remove access to all linked children. This cannot be undone.
            </Text>
            <Button
              mode="outlined"
              onPress={openDeleteConfirm}
              textColor="#d32f2f"
              style={styles.deleteButton}
              icon="delete"
            >
              Delete Account
            </Button>
          </View>

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text variant="bodySmall" style={styles.appVersion}>
              ilmTrack v1.0.0
            </Text>
          </View>
        </ScrollView>

        {/* Delete Account Confirmation Modal */}
        <Portal>
          <Modal
            visible={showDeleteConfirm}
            onDismiss={() => !deleting && setShowDeleteConfirm(false)}
            contentContainerStyle={styles.modalContainer}
          >
            <Text variant="titleLarge" style={styles.deleteModalTitle}>
              Delete Account?
            </Text>

            {linkedStudents.length > 0 && (
              <View style={styles.studentListContainer}>
                <Text variant="bodyMedium" style={styles.deleteModalText}>
                  You will lose access to:
                </Text>
                {linkedStudents.map((s) => (
                  <Text key={s.id} variant="bodyMedium" style={styles.studentListItem}>
                    {'\u2022'} {s.firstName} {s.lastName}
                  </Text>
                ))}
              </View>
            )}

            <Text variant="bodyMedium" style={styles.deleteModalText}>
              If you re-create your account with the same email, you will be re-linked to your students automatically.
            </Text>

            <TextInput
              label="Enter your password to confirm"
              value={deletePassword}
              onChangeText={setDeletePassword}
              mode="outlined"
              secureTextEntry
              style={styles.passwordInput}
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <Button
                mode="contained"
                buttonColor="#d32f2f"
                textColor="#fff"
                onPress={handleDeleteAccount}
                loading={deleting}
                disabled={deleting || !deletePassword.trim()}
              >
                Yes, Delete My Account
              </Button>
              <Button
                mode="outlined"
                onPress={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </View>
          </Modal>
        </Portal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a73e8',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '600',
    marginRight: 12,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: '600',
  },
  stepDescription: {
    color: '#666',
    marginTop: 2,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  accordion: {
    backgroundColor: '#fff',
  },
  answerContainer: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    paddingTop: 0,
  },
  answer: {
    color: '#444',
    lineHeight: 22,
  },
  divider: {
    marginVertical: 24,
  },
  supportText: {
    color: '#666',
    marginBottom: 12,
  },
  contactItem: {
    paddingLeft: 0,
  },
  dangerZone: {
    padding: 16,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  dangerTitle: {
    fontWeight: '600',
    color: '#d32f2f',
    marginBottom: 8,
  },
  dangerNote: {
    color: '#666',
    marginBottom: 16,
  },
  deleteButton: {
    borderColor: '#d32f2f',
  },
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  deleteModalTitle: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: '#d32f2f',
  },
  deleteModalText: {
    color: '#444',
    textAlign: 'center',
    marginBottom: 12,
  },
  studentListContainer: {
    marginBottom: 8,
  },
  studentListItem: {
    color: '#444',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 2,
  },
  passwordInput: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  modalActions: {
    marginTop: 8,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  appVersion: {
    color: '#999',
  },
});
