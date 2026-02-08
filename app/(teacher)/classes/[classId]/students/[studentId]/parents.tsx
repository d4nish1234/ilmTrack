import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, Snackbar, IconButton, Portal, Chip } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../../src/contexts/AuthContext';
import { getStudent, updateStudent } from '../../../../../../src/services/student.service';
import { Button, Input, LoadingSpinner } from '../../../../../../src/components/common';
import { firestore } from '../../../../../../src/config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Student, Parent } from '../../../../../../src/types';
import { unlinkParentsFromStudent } from '../../../../../../src/utils/parentLinkCleanup';

const parentSchema = yup.object({
  firstName: yup.string().required('First name is required'),
  lastName: yup.string().required('Last name is required'),
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
  inviteStatus: yup.string().default('pending'),
});

const schema = yup.object({
  parents: yup
    .array()
    .of(parentSchema)
    .min(1, 'At least one parent is required')
    .max(2, 'Maximum 2 parents allowed'),
});

type FormData = yup.InferType<typeof schema>;

export default function EditParentsScreen() {
  const { studentId } = useLocalSearchParams<{
    studentId: string;
  }>();
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      parents: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'parents',
  });

  useEffect(() => {
    if (!studentId) return;

    const fetchStudent = async () => {
      try {
        const data = await getStudent(studentId);
        setStudent(data);
        if (data) {
          reset({
            parents: data.parents.map((p) => ({
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
              inviteStatus: p.inviteStatus,
            })),
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
    if (!studentId || !user || !student) return;

    setSaving(true);
    setError(null);

    try {
      // Find new parents (emails not in original list)
      const originalEmails = student.parents.map((p) => p.email.toLowerCase());
      const updatedEmails = (data.parents || []).map((p) => p.email.toLowerCase());
      const newParents = data.parents?.filter(
        (p) => !originalEmails.includes(p.email.toLowerCase())
      ) || [];

      // Find removed parents (in original but not in updated)
      const removedParents = student.parents.filter(
        (p) => !updatedEmails.includes(p.email.toLowerCase())
      );

      // Unlink removed parents from this student
      if (removedParents.length > 0) {
        await unlinkParentsFromStudent(studentId, removedParents);
      }

      // Prepare updated parents array
      const updatedParents: Parent[] = (data.parents || []).map((p) => {
        const existingParent = student.parents.find(
          (orig) => orig.email.toLowerCase() === p.email.toLowerCase()
        );
        return {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email.toLowerCase(),
          inviteStatus: existingParent?.inviteStatus || 'pending',
        };
      });

      // Update the student document
      await updateStudent(studentId, { parents: updatedParents });

      // Create invites for new parents
      const invitesRef = collection(firestore, 'invites');
      for (const parent of newParents) {
        await addDoc(invitesRef, {
          email: parent.email.toLowerCase(),
          studentId,
          teacherId: user.uid,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }

      router.back();
    } catch (err: any) {
      console.error('Error updating parents:', err);
      setError('Failed to update parents. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addParent = () => {
    if (fields.length < 2) {
      append({ firstName: '', lastName: '', email: '', inviteStatus: 'pending' });
    }
  };

  const handleRemoveParent = (index: number) => {
    if (fields.length <= 1) {
      Alert.alert('Error', 'At least one parent is required');
      return;
    }
    Alert.alert(
      'Remove Parent',
      'Are you sure you want to remove this parent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => remove(index),
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
          title: 'Edit Parents',
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
            <Text variant="bodyMedium" style={styles.studentName}>
              Student: {student.firstName} {student.lastName}
            </Text>

            <View style={styles.parentHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Parents/Guardians
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

            {fields.map((field, index) => {
              const originalParent = student.parents.find(
                (p) => p.email.toLowerCase() === field.email?.toLowerCase()
              );
              const isExisting = !!originalParent;

              return (
                <View key={field.id} style={styles.parentSection}>
                  <View style={styles.parentTitleRow}>
                    <View style={styles.parentTitleLeft}>
                      <Text variant="titleSmall" style={styles.parentTitle}>
                        Parent {index + 1}
                      </Text>
                      {isExisting && (
                        <Chip
                          compact
                          mode="outlined"
                          textStyle={styles.statusText}
                          style={[
                            styles.statusChip,
                            originalParent?.inviteStatus === 'accepted' && styles.acceptedChip,
                          ]}
                        >
                          {originalParent?.inviteStatus}
                        </Chip>
                      )}
                    </View>
                    {fields.length > 1 && (
                      <IconButton
                        icon="close"
                        size={16}
                        onPress={() => handleRemoveParent(index)}
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
                        disabled={isExisting && originalParent?.inviteStatus === 'accepted'}
                      />
                    </View>
                    <View style={styles.nameField}>
                      <Input
                        control={control}
                        name={`parents.${index}.lastName`}
                        label="Last Name"
                        autoCapitalize="words"
                        disabled={isExisting && originalParent?.inviteStatus === 'accepted'}
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
                    disabled={isExisting}
                  />

                  {!isExisting && (
                    <Text variant="bodySmall" style={styles.newParentNote}>
                      An invitation will be sent to this email
                    </Text>
                  )}
                </View>
              );
            })}

            <View style={styles.actions}>
              <Button onPress={handleSubmit(onSubmit)} loading={saving}>
                Save Changes
              </Button>

              <Button mode="outlined" onPress={() => router.back()}>
                Cancel
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
  studentName: {
    color: '#666',
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '600',
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
  parentTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parentTitle: {
    color: '#666',
  },
  statusChip: {
    marginLeft: 4,
  },
  acceptedChip: {
    backgroundColor: '#e8f5e9',
  },
  statusText: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  newParentNote: {
    color: '#1a73e8',
    fontStyle: 'italic',
    marginTop: -4,
  },
  actions: {
    marginTop: 16,
  },
});
