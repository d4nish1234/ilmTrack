import React from 'react';
import { StyleSheet, View, ScrollView, Linking, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Text, List, Card, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { colors, fontWeight, headerOptions, spacing, typography } from '../../constants/theme';

const SUPPORT_EMAIL = 'info@youngmomins.com';

export interface GuideStep {
  title: string;
  text: string;
}

export interface Faq {
  question: string;
  answer: string;
}

interface HelpAndSupportScreenProps {
  /** The numbered guide's title: 'Quick Start Guide', 'Getting Started'. */
  guideTitle: string;
  steps: GuideStep[];
  faqs: Faq[];
  /** Above the Email Support row. */
  supportText: string;
}

/**
 * Settings → Help & Support, shared by teachers and parents: a numbered
 * getting-started guide, FAQs, email support, and the app version. Each
 * role's route passes its own words.
 */
export function HelpAndSupportScreen({ guideTitle, steps, faqs, supportText }: HelpAndSupportScreenProps) {
  const handleEmailSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=ilmTrack%20Support%20Request`;
    if (await Linking.canOpenURL(url)) {
      Linking.openURL(url);
    } else {
      Alert.alert('Contact Support', `Email us at ${SUPPORT_EMAIL}`);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Help & Support', headerShown: true, ...headerOptions }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant={typography.h4} style={styles.cardTitle}>
                {guideTitle}
              </Text>
              {steps.map((step, i) => (
                <View key={step.title} style={styles.step}>
                  <Text variant={typography.h5} style={styles.stepNumber}>
                    {i + 1}
                  </Text>
                  <View style={styles.stepContent}>
                    <Text variant={typography.body} style={styles.stepTitle}>
                      {step.title}
                    </Text>
                    <Text variant={typography.caption} style={styles.stepDescription}>
                      {step.text}
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>

          <Text variant={typography.h4} style={styles.sectionTitle}>
            Frequently Asked Questions
          </Text>
          <List.AccordionGroup>
            {faqs.map((item, index) => (
              <View key={item.question}>
                {index > 0 && <Divider />}
                <List.Accordion
                  id={String(index)}
                  title={item.question}
                  titleNumberOfLines={2}
                  style={styles.accordion}
                >
                  {/* On the accordion's own background, so an open question and
                      its answer read as one item; lined up with the question. */}
                  <View style={styles.answerContainer}>
                    <Text variant={typography.body} style={styles.answer}>
                      {item.answer}
                    </Text>
                  </View>
                </List.Accordion>
              </View>
            ))}
          </List.AccordionGroup>

          <Divider style={styles.divider} />

          <Text variant={typography.h4} style={styles.sectionTitle}>
            Need More Help?
          </Text>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant={typography.body} style={styles.supportText}>
                {supportText}
              </Text>
              <List.Item
                title="Email Support"
                description={SUPPORT_EMAIL}
                left={(props) => <List.Icon {...props} icon="email" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={handleEmailSupport}
                style={styles.contactItem}
              />
            </Card.Content>
          </Card>

          <View style={styles.appInfo}>
            <Text variant={typography.caption} style={styles.appVersion}>
              ilmTrack v{Constants.expoConfig?.version ?? ''}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const STEP_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
  },
  cardTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: STEP_SIZE / 2,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    textAlign: 'center',
    lineHeight: STEP_SIZE,
    fontWeight: fontWeight.semibold,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: fontWeight.semibold,
  },
  stepDescription: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  accordion: {
    backgroundColor: colors.card,
  },
  answerContainer: {
    backgroundColor: colors.card,
    // Paper indents accordion content by 40; the question's text starts at 16.
    paddingLeft: spacing.lg,
    paddingRight: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  answer: {
    color: colors.textSecondary,
    lineHeight: 22,
  },
  divider: {
    marginVertical: spacing.xl,
  },
  supportText: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  contactItem: {
    paddingLeft: 0,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  appVersion: {
    color: colors.textDisabled,
  },
});
