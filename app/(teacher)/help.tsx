import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Linking, Alert } from 'react-native';
import { Text, List, Divider, Card, Portal, Modal, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/common';
import { getClassesByIds } from '../../src/services/class.service';
import { Class } from '../../src/types';

const FAQ_ITEMS = [
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
    answer: 'Go to the Classes tab, tap the three-dot menu, and select "Reports". Choose a date range and export attendance or homework data as CSV.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Scroll to the Danger Zone section at the bottom of this page and tap "Delete Account". All classes you own and their data will be permanently deleted. You will also be removed as a co-teacher from any shared classes.',
  },
];

export default function TeacherHelpScreen() {
  const { deleteTeacherAccount, user } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [ownedClasses, setOwnedClasses] = useState<Class[]>([]);
  const [adminClasses, setAdminClasses] = useState<Class[]>([]);

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user) return;
      try {
        if (user.classIds?.length) {
          const owned = await getClassesByIds(user.classIds);
          setOwnedClasses(owned);
        }
      } catch (err) {
        console.error('Failed to fetch owned classes:', err);
      }
      try {
        if (user.adminClassIds?.length) {
          const admin = await getClassesByIds(user.adminClassIds);
          // Only show classes where this user is actually in the admins array
          // (adminClassIds on user doc may be stale if they were removed)
          const verified = admin.filter((cls) =>
            cls.admins?.some((a) => a.userId === user.uid)
          );
          setAdminClasses(verified);
        }
      } catch (err) {
        console.error('Failed to fetch admin classes:', err);
      }
    };
    fetchClasses();
  }, [user?.classIds, user?.adminClassIds]);

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }

    setDeleting(true);
    try {
      await deleteTeacherAccount(deletePassword);
    } catch (error: any) {
      console.error('Delete account error:', error);
      if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        Alert.alert('Incorrect Password', 'The password you entered is incorrect. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete account. Please try again.');
      }
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
                Quick Start Guide
              </Text>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>1</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Create a Class</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    Tap the Classes tab and create your first class
                  </Text>
                </View>
              </View>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>2</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Add Students</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    Add students with their parent&apos;s email for notifications
                  </Text>
                </View>
              </View>
              <View style={styles.step}>
                <Text variant="titleSmall" style={styles.stepNumber}>3</Text>
                <View style={styles.stepContent}>
                  <Text variant="bodyMedium" style={styles.stepTitle}>Track Daily</Text>
                  <Text variant="bodySmall" style={styles.stepDescription}>
                    Use swipe gestures to mark attendance and assign homework
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
                If you have questions or issues not covered here, please reach out to our support team.
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
              Permanently delete your account, all your classes, students, and their records. This cannot be undone.
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

            {ownedClasses.length > 0 && (
              <View style={styles.classListContainer}>
                <Text variant="bodyMedium" style={styles.deleteModalText}>
                  The following classes and ALL their data will be permanently deleted:
                </Text>
                {ownedClasses.map((cls) => (
                  <Text key={cls.id} variant="bodyMedium" style={styles.classListItem}>
                    {'\u2022'} {cls.name} ({cls.studentCount} student{cls.studentCount !== 1 ? 's' : ''})
                  </Text>
                ))}
              </View>
            )}

            {adminClasses.length > 0 && (
              <View style={styles.classListContainer}>
                <Text variant="bodyMedium" style={styles.deleteModalText}>
                  You will be removed as co-teacher from:
                </Text>
                {adminClasses.map((cls) => (
                  <Text key={cls.id} variant="bodyMedium" style={styles.classListItem}>
                    {'\u2022'} {cls.name}
                  </Text>
                ))}
              </View>
            )}

            <Text variant="bodyMedium" style={styles.deleteModalWarning}>
              This action cannot be undone.
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
    marginBottom: 8,
  },
  deleteModalWarning: {
    color: '#d32f2f',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
  },
  classListContainer: {
    marginBottom: 8,
  },
  classListItem: {
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
