import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Snackbar, Divider, IconButton, Portal, Card, RadioButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../src/contexts/AuthContext';
import { createStudent, linkExistingStudentToClass } from '../../../../../src/services/student.service';
import { Button, Input } from '../../../../../src/components/common';
import { firestore } from '../../../../../src/config/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Student, User } from '../../../../../src/types';

// Look up if a user account exists with this email
async function getUserByEmail(email: string): Promise<User | null> {
  const usersRef = collection(firestore, 'users');
  const q = query(usersRef, where('email', '==', email.toLowerCase()), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { uid: doc.id, ...doc.data() } as User;
}

// Deduplicate students by name (same child in multiple classes)
function deduplicateStudentsByName(students: Student[]): Student[] {
  const seen = new Map<string, Student>();
  for (const student of students) {
    const key = `${student.firstName.toLowerCase()}-${student.lastName.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, student);
    }
  }
  return Array.from(seen.values());
}

// Check if a student with the same name is already in a specific class
function isStudentNameInClass(students: Student[], studentName: { firstName: string; lastName: string }, classId: string): boolean {
  return students.some(
    (s) =>
      s.firstName.toLowerCase() === studentName.firstName.toLowerCase() &&
      s.lastName.toLowerCase() === studentName.lastName.toLowerCase() &&
      s.classId === classId
  );
}

// Step 1: Email lookup schema
const emailSchema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
});

// Step 2: Parent info schema
const parentSchema = yup.object({
  firstName: yup.string().required('First name is required'),
  lastName: yup.string().required('Last name is required'),
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
});

// Full student schema
const studentSchema = yup.object({
  firstName: yup.string().required('Student first name is required'),
  lastName: yup.string().required('Student last name is required'),
  parents: yup
    .array()
    .of(parentSchema)
    .min(1, 'At least one parent is required')
    .max(2, 'Maximum 2 parents allowed'),
});

type EmailFormData = yup.InferType<typeof emailSchema>;
type StudentFormData = yup.InferType<typeof studentSchema>;

type Step = 'email' | 'select-or-add' | 'add-student';

export default function AddStudentScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentEmail, setParentEmail] = useState('');
  const [allMatchingStudents, setAllMatchingStudents] = useState<Student[]>([]);
  const [uniqueStudents, setUniqueStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // Track if parents have existing accounts (to show their names as read-only)
  // Key is parent index (0 or 1)
  const [existingParentUsers, setExistingParentUsers] = useState<Record<number, { firstName: string; lastName: string }>>({});

  // Email form
  const emailForm = useForm<EmailFormData>({
    resolver: yupResolver(emailSchema),
    defaultValues: { email: '' },
  });

  // Student form
  const studentForm = useForm<StudentFormData>({
    resolver: yupResolver(studentSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      parents: [{ firstName: '', lastName: '', email: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: studentForm.control,
    name: 'parents',
  });

  const handleEmailLookup = async (data: EmailFormData) => {
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = data.email.toLowerCase().trim();
      setParentEmail(normalizedEmail);

      // Check if a user account already exists with this email
      const existingUser = await getUserByEmail(normalizedEmail);
      if (existingUser) {
        setExistingParentUsers((prev) => ({
          ...prev,
          0: { firstName: existingUser.firstName, lastName: existingUser.lastName },
        }));
        // Pre-fill their name in the form
        studentForm.setValue('parents.0.firstName', existingUser.firstName);
        studentForm.setValue('parents.0.lastName', existingUser.lastName);
      } else {
        setExistingParentUsers((prev) => {
          const { 0: _, ...rest } = prev;
          return rest;
        });
      }

      // Look for students with this parent email
      const studentsRef = collection(firestore, 'students');
      const q = query(studentsRef, where('teacherId', '==', user?.uid));
      const snapshot = await getDocs(q);

      const matchingStudents: Student[] = [];
      snapshot.docs.forEach((doc) => {
        const student = { id: doc.id, ...doc.data() } as Student;
        // Check if any parent has this email
        const hasParent = student.parents?.some(
          (p) => p.email.toLowerCase() === normalizedEmail
        );
        if (hasParent) {
          matchingStudents.push(student);
        }
      });

      setAllMatchingStudents(matchingStudents);
      const deduplicated = deduplicateStudentsByName(matchingStudents);
      setUniqueStudents(deduplicated);

      // Pre-fill the parent email in the student form
      studentForm.setValue('parents.0.email', normalizedEmail);

      if (deduplicated.length > 0) {
        // Show selection screen
        setStep('select-or-add');
      } else {
        // Go directly to add student
        setStep('add-student');
      }
    } catch (err) {
      console.error('Error looking up email:', err);
      setError('Failed to look up email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExisting = async () => {
    if (!selectedStudentId || !classId) return;

    setLoading(true);
    setError(null);

    try {
      await linkExistingStudentToClass(selectedStudentId, classId);
      router.back();
    } catch (err: any) {
      console.error('Error linking student:', err);
      if (err.message?.includes('already in this class')) {
        setError('This student is already in this class.');
      } else {
        setError('Failed to add student to class. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewStudent = async (data: StudentFormData) => {
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

  // Look up if a parent email has an existing account
  const lookupParentEmail = async (index: number) => {
    const email = studentForm.getValues(`parents.${index}.email`);
    if (!email) return;

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser) {
      setExistingParentUsers((prev) => ({
        ...prev,
        [index]: { firstName: existingUser.firstName, lastName: existingUser.lastName },
      }));
      // Pre-fill their name in the form
      studentForm.setValue(`parents.${index}.firstName`, existingUser.firstName);
      studentForm.setValue(`parents.${index}.lastName`, existingUser.lastName);
    } else {
      // Clear if no account found
      setExistingParentUsers((prev) => {
        const { [index]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const goBack = () => {
    if (step === 'add-student' && uniqueStudents.length > 0) {
      setStep('select-or-add');
    } else if (step === 'add-student' || step === 'select-or-add') {
      setStep('email');
      setAllMatchingStudents([]);
      setUniqueStudents([]);
      setSelectedStudentId(null);
      setExistingParentUsers({});
    } else {
      router.back();
    }
  };

  // Step 1: Email lookup
  if (step === 'email') {
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
            <Text variant="titleLarge" style={styles.stepTitle}>
              Add Student
            </Text>
            <Text variant="bodyMedium" style={styles.stepDescription}>
              Enter a parent&apos;s email to check if they already have children in your classes.
            </Text>

            <Input
              control={emailForm.control}
              name="email"
              label="Parent Email"
              placeholder="parent@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
            />

            <View style={styles.actions}>
              <Button
                onPress={emailForm.handleSubmit(handleEmailLookup)}
                loading={loading}
              >
                Continue
              </Button>
              <Button mode="outlined" onPress={() => router.back()}>
                Cancel
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Portal>
          <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
            {error}
          </Snackbar>
        </Portal>
      </SafeAreaView>
    );
  }

  // Step 2: Select existing or add new
  if (step === 'select-or-add') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text variant="titleLarge" style={styles.stepTitle}>
            Existing Children Found
          </Text>
          <Text variant="bodyMedium" style={styles.stepDescription}>
            We found {uniqueStudents.length} child{uniqueStudents.length > 1 ? 'ren' : ''} linked to {parentEmail}.
            Select one to add to this class, or add a new child.
          </Text>

          <RadioButton.Group
            value={selectedStudentId || ''}
            onValueChange={(value) => setSelectedStudentId(value)}
          >
            {uniqueStudents.map((student) => {
              const alreadyInThisClass = isStudentNameInClass(allMatchingStudents, student, classId!);
              return (
                <TouchableOpacity
                  key={student.id}
                  onPress={() => setSelectedStudentId(student.id)}
                >
                  <Card
                    style={[
                      styles.studentCard,
                      selectedStudentId === student.id && styles.studentCardSelected,
                    ]}
                  >
                    <Card.Content style={styles.studentCardContent}>
                      <RadioButton value={student.id} />
                      <View style={styles.studentInfo}>
                        <Text variant="titleMedium">
                          {student.firstName} {student.lastName}
                        </Text>
                        {alreadyInThisClass && (
                          <Text variant="bodySmall" style={styles.alreadyInClass}>
                            Already in this class
                          </Text>
                        )}
                      </View>
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </RadioButton.Group>

          <Divider style={styles.divider} />

          <TouchableOpacity
            style={styles.addNewOption}
            onPress={() => setStep('add-student')}
          >
            <IconButton icon="plus" size={24} />
            <Text variant="titleMedium" style={styles.addNewText}>
              Add a new child for this parent
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <Button
              onPress={handleSelectExisting}
              loading={loading}
              disabled={!selectedStudentId || (() => {
                const selected = uniqueStudents.find(s => s.id === selectedStudentId);
                return selected ? isStudentNameInClass(allMatchingStudents, selected, classId!) : false;
              })()}
            >
              Add Selected Student
            </Button>
            <Button mode="outlined" onPress={goBack}>
              Back
            </Button>
          </View>
        </ScrollView>

        <Portal>
          <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
            {error}
          </Snackbar>
        </Portal>
      </SafeAreaView>
    );
  }

  // Step 3: Add new student form
  return (
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
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Student Information
          </Text>

          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Input
                control={studentForm.control}
                name="firstName"
                label="First Name"
                autoCapitalize="words"
                autoFocus
              />
            </View>
            <View style={styles.nameField}>
              <Input
                control={studentForm.control}
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

          {fields.map((field, index) => {
            // Check if this parent has an existing account
            const existingParent = existingParentUsers[index];

            return (
              <View key={field.id} style={styles.parentSection}>
                <View style={styles.parentTitleRow}>
                  <Text variant="titleSmall" style={styles.parentTitle}>
                    Parent {index + 1}
                  </Text>
                  {fields.length > 1 && (
                    <IconButton
                      icon="close"
                      size={16}
                      onPress={() => {
                        remove(index);
                        // Clear existing parent lookup for this index
                        setExistingParentUsers((prev) => {
                          const { [index]: _, ...rest } = prev;
                          return rest;
                        });
                      }}
                    />
                  )}
                </View>

                {existingParent ? (
                  // Show read-only name for existing account
                  <View style={styles.existingParentInfo}>
                    <Text variant="bodySmall" style={styles.existingParentLabel}>
                      Account found - name from their profile:
                    </Text>
                    <Text variant="titleMedium" style={styles.existingParentName}>
                      {existingParent.firstName} {existingParent.lastName}
                    </Text>
                  </View>
                ) : (
                  // Editable name fields for new parent
                  <View style={styles.nameRow}>
                    <View style={styles.nameField}>
                      <Input
                        control={studentForm.control}
                        name={`parents.${index}.firstName`}
                        label="First Name"
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={styles.nameField}>
                      <Input
                        control={studentForm.control}
                        name={`parents.${index}.lastName`}
                        label="Last Name"
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                {/* First parent email is pre-filled and disabled */}
                {index === 0 ? (
                  <Input
                    control={studentForm.control}
                    name={`parents.${index}.email`}
                    label="Email"
                    placeholder="parent@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    disabled
                  />
                ) : (
                  // Second parent - show email with lookup button
                  <View style={styles.emailWithLookup}>
                    <View style={styles.emailField}>
                      <Input
                        control={studentForm.control}
                        name={`parents.${index}.email`}
                        label="Email"
                        placeholder="parent@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                      />
                    </View>
                    <IconButton
                      icon="account-search"
                      mode="contained"
                      size={20}
                      onPress={() => lookupParentEmail(index)}
                      style={styles.lookupButton}
                    />
                  </View>
                )}
              </View>
            );
          })}

          <Text variant="bodySmall" style={styles.inviteNote}>
            An invitation email will be sent to each parent to create their
            account and view their child&apos;s homework and attendance.
          </Text>

          <View style={styles.actions}>
            <Button
              onPress={studentForm.handleSubmit(handleAddNewStudent)}
              loading={loading}
            >
              Add Student
            </Button>
            <Button mode="outlined" onPress={goBack}>
              Back
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
  stepTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  stepDescription: {
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
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
  existingParentInfo: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  existingParentLabel: {
    color: '#2e7d32',
    marginBottom: 4,
  },
  existingParentName: {
    color: '#1b5e20',
    fontWeight: '600',
  },
  emailWithLookup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  emailField: {
    flex: 1,
  },
  lookupButton: {
    marginTop: 8,
  },
  inviteNote: {
    color: '#666',
    marginTop: 8,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
  studentCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  studentCardSelected: {
    borderColor: '#1a73e8',
    borderWidth: 2,
  },
  studentCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentInfo: {
    flex: 1,
    marginLeft: 8,
  },
  alreadyInClass: {
    color: '#f44336',
    marginTop: 2,
  },
  addNewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderStyle: 'dashed',
  },
  addNewText: {
    color: '#1a73e8',
    flex: 1,
  },
});
