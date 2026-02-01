import React from 'react';
import { StyleSheet, View, ScrollView, Linking } from 'react-native';
import { Text, List, Divider, Card } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

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
];

export default function TeacherHelpScreen() {
  const handleEmailSupport = () => {
    Linking.openURL('mailto:info@youngmomins.com?subject=IlmTrack Support Request');
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

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text variant="bodySmall" style={styles.appVersion}>
              IlmTrack v1.0.0
            </Text>
          </View>
        </ScrollView>
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
  appInfo: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  appVersion: {
    color: '#999',
  },
});
