import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Text, Snackbar, Divider, IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../src/contexts/AuthContext';
import { createStudent } from '../../../../../src/services/student.service';
import { Button, Input } from '../../../../../src/components/common';

const parentSchema = yup.object({
  firstName: yup.string().required('First name is required'),
  lastName: yup.string().required('Last name is required'),
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
});

const schema = yup.object({
  firstName: yup.string().required('Student first name is required'),
  lastName: yup.string().required('Student last name is required'),
  parents: yup
    .array()
    .of(parentSchema)
    .min(1, 'At least one parent is required')
    .max(2, 'Maximum 2 parents allowed'),
});

type FormData = yup.InferType<typeof schema>;

export default function AddStudentScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      parents: [{ firstName: '', lastName: '', email: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'parents',
  });

  const onSubmit = async (data: FormData) => {
    if (!classId || !user) return;

    setLoading(true);
    setError(null);

    try {
      await createStudent(classId, user.uid, {
        firstName: data.firstName,
        lastName: data.lastName,
        parents: data.parents as any,
      });
      router.back();
    } catch (err: any) {
      console.error('Error creating student:', err);
      setError('Failed to add student. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addParent = () => {
    if (fields.length < 2) {
      append({ firstName: '', lastName: '', email: '' });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Student Information
          </Text>

          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Input
                control={control}
                name="firstName"
                label="First Name"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.nameField}>
              <Input
                control={control}
                name="lastName"
                label="Last Name"
                autoCapitalize="words"
              />
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.parentHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Parent/Guardian Information
            </Text>
            {fields.length < 2 && (
              <IconButton
                icon="plus"
                mode="contained"
                size={20}
                onPress={addParent}
              />
            )}
          </View>

          {fields.map((field, index) => (
            <View key={field.id} style={styles.parentSection}>
              <View style={styles.parentTitleRow}>
                <Text variant="titleSmall" style={styles.parentTitle}>
                  Parent {index + 1}
                </Text>
                {fields.length > 1 && (
                  <IconButton
                    icon="close"
                    size={16}
                    onPress={() => remove(index)}
                  />
                )}
              </View>

              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <Input
                    control={control}
                    name={`parents.${index}.firstName`}
                    label="First Name"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.nameField}>
                  <Input
                    control={control}
                    name={`parents.${index}.lastName`}
                    label="Last Name"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Input
                control={control}
                name={`parents.${index}.email`}
                label="Email"
                placeholder="parent@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          ))}

          <Text variant="bodySmall" style={styles.inviteNote}>
            An invitation email will be sent to each parent to create their
            account and view their child's homework and attendance.
          </Text>

          <View style={styles.actions}>
            <Button onPress={handleSubmit(onSubmit)} loading={loading}>
              Add Student
            </Button>

            <Button mode="outlined" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={4000}
      >
        {error}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  divider: {
    marginVertical: 20,
  },
  parentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  parentSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  parentTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  parentTitle: {
    color: '#666',
  },
  inviteNote: {
    color: '#666',
    marginTop: 8,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  actions: {
    marginTop: 16,
  },
});
