import React, { useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppSnackbar, Button } from '../../src/components/common';
import { auth } from '../../src/config/firebase';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { colors, fontWeight, spacing, typography } from '../../src/constants/theme';

export default function VerifyEmailScreen() {
  const { user, firebaseUser, resendVerificationEmail, reloadFirebaseUser } =
    useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleResendEmail = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      setMessage({ text: 'Verification email sent. Check your inbox and spam folder.', type: 'success' });
    } catch (error: any) {
      console.error('Error resending verification email:', error);
      if (error.code === 'auth/too-many-requests') {
        setMessage({ text: 'Please wait a few minutes before asking for another email.', type: 'error' });
      } else {
        setMessage({ text: "Couldn't send the verification email. Please try again.", type: 'error' });
      }
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setChecking(true);
    try {
      await reloadFirebaseUser();
      // Check fresh auth state directly
      const currentUser = auth.currentUser;
      if (currentUser?.emailVerified) {
        // Email is verified - navigate to appropriate home screen
        if (user?.role === 'teacher') {
          router.replace('/(teacher)');
        } else {
          router.replace('/(parent)');
        }
      } else {
        Alert.alert(
          'Not Verified Yet',
          'Your email has not been verified yet. Please click the link in the verification email first, then try again.'
        );
      }
    } catch (error) {
      console.error('Error checking verification:', error);
      setMessage({ text: "Couldn't check your email. Please try again.", type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const handleGoBack = async () => {
    // Sign out so user can start fresh (e.g., if they entered wrong email)
    await firebaseSignOut(auth);
    router.replace('/(auth)/signup');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <IconButton
          icon="email-check"
          size={80}
          iconColor={colors.primary}
          style={styles.icon}
        />

        <Text variant={typography.h1} style={styles.title}>
          Verify Your Email
        </Text>

        <Text variant={typography.bodyLarge} style={styles.description}>
          We&apos;ve sent a verification email to:
        </Text>

        <Text variant={typography.h4} style={styles.email}>
          {firebaseUser?.email}
        </Text>

        <Text variant={typography.body} style={styles.instructions}>
          Please click the link in the email to verify your account. Once
          verified, tap the button below to continue.
        </Text>

        <Text variant={typography.caption} style={styles.spamNote}>
          Can&apos;t find the email? Check your spam or junk folder.
        </Text>

        <View style={styles.actions}>
          <Button onPress={handleCheckVerification} loading={checking}>
            I&apos;ve Verified My Email
          </Button>

          <Button
            mode="outlined"
            onPress={handleResendEmail}
            loading={resending}
          >
            Resend Verification Email
          </Button>

          <Button mode="text" onPress={handleGoBack} textColor={colors.textSecondary}>
            Use Different Email
          </Button>
        </View>
      </View>
      <AppSnackbar type={message?.type} message={message?.text ?? null} onDismiss={() => setMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    marginBottom: spacing.lg,
  },
  title: {
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  description: {
    textAlign: 'center',
    color: colors.textSecondary,
  },
  email: {
    textAlign: 'center',
    color: colors.primary,
    marginVertical: spacing.sm,
  },
  instructions: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  spamNote: {
    textAlign: 'center',
    color: colors.textDisabled,
    fontStyle: 'italic',
    marginBottom: 32,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
});
