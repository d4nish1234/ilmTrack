import React, { useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/common';

export default function VerifyEmailScreen() {
  const { firebaseUser, signOut, resendVerificationEmail, reloadFirebaseUser } =
    useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResendEmail = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      Alert.alert(
        'Email Sent',
        'A new verification email has been sent. Please check your inbox and spam/junk folder.'
      );
    } catch (error: any) {
      console.error('Error resending verification email:', error);
      if (error.code === 'auth/too-many-requests') {
        Alert.alert(
          'Too Many Requests',
          'Please wait a few minutes before requesting another verification email.'
        );
      } else {
        Alert.alert('Error', 'Failed to send verification email. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setChecking(true);
    try {
      await reloadFirebaseUser();
      // The root layout will automatically redirect if verified
    } catch (error) {
      console.error('Error checking verification:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <IconButton
          icon="email-check"
          size={80}
          iconColor="#1a73e8"
          style={styles.icon}
        />

        <Text variant="headlineMedium" style={styles.title}>
          Verify Your Email
        </Text>

        <Text variant="bodyLarge" style={styles.description}>
          We've sent a verification email to:
        </Text>

        <Text variant="titleMedium" style={styles.email}>
          {firebaseUser?.email}
        </Text>

        <Text variant="bodyMedium" style={styles.instructions}>
          Please click the link in the email to verify your account. Once
          verified, tap the button below to continue.
        </Text>

        <Text variant="bodySmall" style={styles.spamNote}>
          Can't find the email? Check your spam or junk folder.
        </Text>

        <View style={styles.actions}>
          <Button onPress={handleCheckVerification} loading={checking}>
            I've Verified My Email
          </Button>

          <Button
            mode="outlined"
            onPress={handleResendEmail}
            loading={resending}
          >
            Resend Verification Email
          </Button>

          <Button mode="text" onPress={handleSignOut} textColor="#666">
            Sign Out
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    textAlign: 'center',
    color: '#666',
  },
  email: {
    textAlign: 'center',
    color: '#1a73e8',
    marginVertical: 8,
  },
  instructions: {
    textAlign: 'center',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 22,
  },
  spamNote: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 32,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
});
