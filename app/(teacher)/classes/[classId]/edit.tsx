import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, Snackbar, IconButton, Portal, Chip, Divider } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../src/contexts/AuthContext';
import {
  getClass,
  updateClass,
  addAdmin,
  removeAdmin,
} from '../../../../src/services/class.service';
import { Button, Input, LoadingSpinner } from '../../../../src/components/common';
import { Class, Admin } from '../../../../src/types';

const adminSchema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email')
    .required('Email is required'),
});

const schema = yup.object({
  name: yup.string().required('Class name is required'),
  description: yup.string(),
  newAdminEmail: yup.string().email('Please enter a valid email'),
});

type FormData = yup.InferType<typeof schema>;

export default function EditClassScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [classData, setClassData] = useState<Class | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);

  const { control, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      newAdminEmail: '',
    },
  });

  const newAdminEmail = watch('newAdminEmail');

  useEffect(() => {
    if (!classId) return;

    const fetchClass = async () => {
      try {
        const data = await getClass(classId);
        setClassData(data);
        if (data) {
          reset({
            name: data.name,
            description: data.description || '',
            newAdminEmail: '',
          });
          setAdmins(data.admins || []);
        }
      } catch (err) {
        console.error('Error fetching class:', err);
        setError('Failed to load class data');
      } finally {
        setLoading(false);
      }
    };

    fetchClass();
  }, [classId, reset]);

  const onSubmit = async (data: FormData) => {
    if (!classId || !user || !classData) return;

    setSaving(true);
    setError(null);

    try {
      await updateClass(classId, {
        name: data.name,
        description: data.description,
      });
      router.back();
    } catch (err: any) {
      console.error('Error updating class:', err);
      setError('Failed to update class. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail || !classId) return;

    // Validate email
    try {
      await adminSchema.validate({ email: newAdminEmail });
    } catch (err: any) {
      setError(err.message);
      return;
    }

    // Check if it's the owner's email
    if (newAdminEmail.toLowerCase() === user?.email?.toLowerCase()) {
      setError('You cannot add yourself as an admin');
      return;
    }

    // Check if admin already exists
    if (admins.some((a) => a.email.toLowerCase() === newAdminEmail.toLowerCase())) {
      setError('This email is already an admin');
      return;
    }

    setAddingAdmin(true);
    setError(null);

    try {
      await addAdmin(classId, newAdminEmail);
      // Refresh class data
      const updatedClass = await getClass(classId);
      if (updatedClass) {
        setAdmins(updatedClass.admins || []);
      }
      setValue('newAdminEmail', '');
      setShowAddAdmin(false);
    } catch (err: any) {
      console.error('Error adding admin:', err);
      setError(err.message || 'Failed to add admin');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = (email: string) => {
    Alert.alert(
      'Remove Admin',
      `Are you sure you want to remove ${email} as an admin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!classId) return;
            try {
              await removeAdmin(classId, email);
              // Refresh class data
              const updatedClass = await getClass(classId);
              if (updatedClass) {
                setAdmins(updatedClass.admins || []);
              }
            } catch (err: any) {
              console.error('Error removing admin:', err);
              setError(err.message || 'Failed to remove admin');
            }
          },
        },
      ]
    );
  };

  const isOwner = classData?.teacherId === user?.uid;

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!classData) {
    return (
      <View style={styles.errorContainer}>
        <Text>Class not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Class',
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
                Class Details
              </Text>

              <Input
                control={control}
                name="name"
                label="Class Name"
                placeholder="e.g., Math 101, Grade 5"
                autoCapitalize="words"
              />

              <Input
                control={control}
                name="description"
                label="Description (Optional)"
                placeholder="Brief description of the class"
                multiline
                numberOfLines={3}
              />
            </View>

            <Divider style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.adminHeader}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Admins
                </Text>
                {isOwner && !showAddAdmin && (
                  <IconButton
                    icon="plus"
                    mode="contained"
                    size={20}
                    onPress={() => setShowAddAdmin(true)}
                  />
                )}
              </View>

              <Text variant="bodySmall" style={styles.adminNote}>
                Admins can view and manage students, homework, and attendance for this class.
              </Text>

              {showAddAdmin && (
                <View style={styles.addAdminSection}>
                  <Input
                    control={control}
                    name="newAdminEmail"
                    label="Admin Email"
                    placeholder="admin@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                  <View style={styles.addAdminActions}>
                    <Button
                      mode="contained"
                      onPress={handleAddAdmin}
                      loading={addingAdmin}
                      disabled={!newAdminEmail}
                      style={styles.addButton}
                    >
                      Add Admin
                    </Button>
                    <Button
                      mode="text"
                      onPress={() => {
                        setShowAddAdmin(false);
                        setValue('newAdminEmail', '');
                      }}
                    >
                      Cancel
                    </Button>
                  </View>
                </View>
              )}

              {admins.length === 0 ? (
                <Text variant="bodyMedium" style={styles.noAdmins}>
                  No admins added yet
                </Text>
              ) : (
                admins.map((admin, index) => (
                  <View key={admin.email} style={styles.adminItem}>
                    <View style={styles.adminInfo}>
                      <Text variant="bodyMedium" style={styles.adminEmail}>
                        {admin.email}
                      </Text>
                      <Chip
                        compact
                        mode="outlined"
                        textStyle={styles.statusText}
                        style={[
                          styles.statusChip,
                          admin.inviteStatus === 'accepted' && styles.acceptedChip,
                        ]}
                      >
                        {admin.inviteStatus}
                      </Chip>
                    </View>
                    {isOwner && (
                      <IconButton
                        icon="close"
                        size={16}
                        onPress={() => handleRemoveAdmin(admin.email)}
                      />
                    )}
                  </View>
                ))
              )}
            </View>

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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  divider: {
    marginVertical: 16,
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  adminNote: {
    color: '#666',
    marginBottom: 16,
  },
  addAdminSection: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 16,
  },
  addAdminActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  addButton: {
    flex: 1,
  },
  noAdmins: {
    color: '#666',
    fontStyle: 'italic',
  },
  adminItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  adminInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminEmail: {
    flex: 1,
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
  actions: {
    marginTop: 16,
  },
});
