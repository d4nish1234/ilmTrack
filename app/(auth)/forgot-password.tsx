import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, Snackbar, Portal } from 'react-native-paper';
import { Link, router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button, Input } from '../../src/components/common';
import { getAuthErrorMessage } from '../../src/utils/authErrors';

const schema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
});

type FormData = yup.InferType<typeof schema>;

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError(null);

    try {
      await resetPassword(data.email);
      setSuccess(true);
    } catch (err: unknown) {
      console.error('Password reset error:', err);
      const errorMessage = getAuthErrorMessage(err as { code?: string; message?: string });
      setError(errorMessage);
      Alert.alert('Password Reset Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text variant="headlineMedium" style={styles.successTitle}>
            Check your email
          </Text>
          <Text variant="bodyLarge" style={styles.successMessage}>
            We've sent a password reset link to your email address. Please check
            your inbox and follow the instructions.
          </Text>
          <Link href="/(auth)/login" asChild>
            <Button>Back to Sign In</Button>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            Reset Password
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Enter your email address and we'll send you a link to reset your
            password.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            control={control}
            name="email"
            label="Email"
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Button onPress={handleSubmit(onSubmit)} loading={loading}>
            Send Reset Link
          </Button>
        </View>

        <View style={styles.footer}>
          <Link href="/(auth)/login" asChild>
            <Button mode="text" icon="arrow-left">
              Back to Sign In
            </Button>
          </Link>
        </View>
      </ScrollView>

      <Portal>
        <Snackbar
          visible={!!error}
          onDismiss={() => setError(null)}
          duration={4000}
          action={{
            label: 'Dismiss',
            onPress: () => setError(null),
          }}
        >
          {error}
        </Snackbar>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    color: '#666',
  },
  form: {
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    alignItems: 'center',
  },
  successTitle: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  successMessage: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
});
