import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, Snackbar, IconButton, Portal, Divider } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStudent, updateStudent, deleteStudent } from '../../../../../../src/services/student.service';
import { Button, Input, LoadingSpinner } from '../../../../../../src/components/common';
import { Student } from '../../../../../../src/types';

const schema = yup.object({
  firstName: yup.string().required('First name is required'),
  lastName: yup.string().required('Last name is required'),
});

type FormData = yup.InferType<typeof schema>;

export default function EditStudentScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
    },
  });

  useEffect(() => {
    if (!studentId) return;

    const fetchStudent = async () => {
      try {
        const data = await getStudent(studentId);
        setStudent(data);
        if (data) {
          reset({
            firstName: data.firstName,
            lastName: data.lastName,
          });
        }
      } catch (err) {
        console.error('Error fetching student:', err);
        setError('Failed to load student data');
      } finally {
        setLoading(false);
      }
    };

    fetchStudent();
  }, [studentId, reset]);

  const onSubmit = async (data: FormData) => {
    if (!studentId) return;

    setSaving(true);
    setError(null);

    try {
      await updateStudent(studentId, {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
      });
      router.back();
    } catch (err: any) {
      console.error('Error updating student:', err);
      setError('Failed to update student. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = () => {
    Alert.alert(
      'Delete Student',
      'Are you sure you want to delete this student? This will permanently delete all their homework and attendance records. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!studentId || !classId) return;
            setDeleting(true);
            try {
              await deleteStudent(studentId, classId);
              // Navigate back to class detail
              router.replace(`/(teacher)/classes/${classId}`);
            } catch (error) {
              console.error('Error deleting student:', error);
              setError('Failed to delete student. Please try again.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!student) {
    return (
      <View style={styles.errorContainer}>
        <Text>Student not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Student',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor="#fff"
              size={24}
              style={{ margin: 0 }}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Student Details
              </Text>

              <Input
                control={control}
                name="firstName"
                label="First Name"
                placeholder="Enter first name"
                autoCapitalize="words"
              />

              <Input
                control={control}
                name="lastName"
                label="Last Name"
                placeholder="Enter last name"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.actions}>
              <Button onPress={handleSubmit(onSubmit)} loading={saving}>
                Save Changes
              </Button>

              <Button mode="outlined" onPress={() => router.back()}>
                Cancel
              </Button>
            </View>

            <Divider style={styles.dangerDivider} />
            <View style={styles.dangerZone}>
              <Text variant="titleMedium" style={styles.dangerTitle}>
                Danger Zone
              </Text>
              <Text variant="bodySmall" style={styles.dangerNote}>
                Deleting this student will permanently remove all their homework and attendance records.
              </Text>
              <Button
                mode="outlined"
                onPress={handleDeleteStudent}
                loading={deleting}
                textColor="#d32f2f"
                style={styles.deleteButton}
              >
                Delete Student
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Portal>
          <Snackbar
            visible={!!error}
            onDismiss={() => setError(null)}
            duration={4000}
          >
            {error}
          </Snackbar>
        </Portal>
      </SafeAreaView>
    </>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  actions: {
    marginTop: 16,
  },
  dangerDivider: {
    marginTop: 32,
    marginBottom: 16,
  },
  dangerZone: {
    padding: 16,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    marginBottom: 32,
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
});
