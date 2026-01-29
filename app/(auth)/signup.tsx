import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Text, Snackbar, SegmentedButtons } from 'react-native-paper';
import { Link } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button, Input } from '../../src/components/common';
import { UserRole } from '../../src/types';

const schema = yup.object({
  firstName: yup.string().required('First name is required'),
  lastName: yup.string().required('Last name is required'),
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

type FormData = yup.InferType<typeof schema>;

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('teacher');

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError(null);

    try {
      await signUp(
        data.email,
        data.password,
        role,
        data.firstName,
        data.lastName
      );
      // Navigation is handled by the root layout based on user role
    } catch (err: any) {
      console.error('Signup error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else {
        setError('Failed to create account. Please try again');
      }
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
            Create your account
          </Text>
        </View>

        <View style={styles.form}>
          <Text variant="titleMedium" style={styles.roleLabel}>
            I am a:
          </Text>
          <SegmentedButtons
            value={role}
            onValueChange={(value) => setRole(value as UserRole)}
            buttons={[
              { value: 'teacher', label: 'Teacher' },
              { value: 'parent', label: 'Parent' },
            ]}
            style={styles.segmentedButtons}
          />

          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Input
                control={control}
                name="firstName"
                label="First Name"
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>
            <View style={styles.nameField}>
              <Input
                control={control}
                name="lastName"
                label="Last Name"
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>
          </View>

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
            placeholder="Create a password"
            secureTextEntry
            autoComplete="password"
          />

          <Input
            control={control}
            name="confirmPassword"
            label="Confirm Password"
            placeholder="Confirm your password"
            secureTextEntry
            autoComplete="password"
          />

          <Button onPress={handleSubmit(onSubmit)} loading={loading}>
            Create Account
          </Button>
        </View>

        <View style={styles.footer}>
          <Text variant="bodyMedium">Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Button mode="text">Sign In</Button>
          </Link>
        </View>
      </ScrollView>

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
    marginBottom: 32,
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
  roleLabel: {
    marginBottom: 8,
    color: '#333',
  },
  segmentedButtons: {
    marginBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  footer: {
    alignItems: 'center',
  },
});
