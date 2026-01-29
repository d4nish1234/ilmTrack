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
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});

type FormData = yup.InferType<typeof schema>;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError(null);

    try {
      await signIn(data.email, data.password);
      // Navigation is handled by the root layout based on user role
    } catch (err: unknown) {
      console.error('Login error:', err);
      const errorMessage = getAuthErrorMessage(err as { code?: string; message?: string });
      setError(errorMessage);
      Alert.alert('Sign In Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
          <Text variant="displaySmall" style={styles.title}>
            IlmTrack
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Sign in to continue
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

          <Input
            control={control}
            name="password"
            label="Password"
            placeholder="Enter your password"
            secureTextEntry
            autoComplete="password"
          />

          <Button onPress={handleSubmit(onSubmit)} loading={loading}>
            Sign In
          </Button>

          <Link href="/(auth)/forgot-password" asChild>
            <Button mode="text">Forgot Password?</Button>
          </Link>
        </View>

        <View style={styles.footer}>
          <Text variant="bodyMedium">Don't have an account?</Text>
          <Link href="/(auth)/signup" asChild>
            <Button mode="text">Sign Up</Button>
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
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  subtitle: {
    color: '#666',
    marginTop: 8,
  },
  form: {
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
  },
});
