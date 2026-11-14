import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, IconButton, Chip, Divider } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../src/contexts/AuthContext';
import {
  getClass,
  updateClass,
  addAdmin,
  removeAdmin,
  deleteClass,
} from '../../../../src/services/class.service';
import { Button, Input, LoadingSpinner, AppSnackbar } from '../../../../src/components/common';
import { Class, Admin } from '../../../../src/types';
import { colors, fontSize, fontWeight, radius, spacing, typography } from '../../../../src/constants/theme';

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);

  const { control, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      newAdminEmail: '',
    },
  });

  const watchedName = watch('name');
  const watchedDescription = watch('description');
  const newAdminEmail = watch('newAdminEmail');

  const hasClassChanges =
    classData != null &&
    (watchedName !== classData.name ||
      (watchedDescription || '') !== (classData.description || ''));

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
      // Update local classData so hasClassChanges becomes false
      setClassData({ ...classData, name: data.name!, description: data.description || '' });
      setSuccess('Class details updated');
    } catch (err: any) {
      console.error('Error updating class:', err);
      setError('Failed to update class. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!classData) return;
    reset({
      name: classData.name,
      description: classData.description || '',
      newAdminEmail: '',
    });
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
      setError('You cannot add yourself as a teacher');
      return;
    }

    // Check if admin already exists
    if (admins.some((a) => a.email.toLowerCase() === newAdminEmail.toLowerCase())) {
      setError('This teacher already has access');
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
      setSuccess('Teacher invite sent');
    } catch (err: any) {
      console.error('Error adding admin:', err);
      setError(err.message || 'Failed to add admin');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = (email: string) => {
    Alert.alert(
      'Remove Teacher',
      `Are you sure you want to remove ${email}'s access?`,
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
              setSuccess('Teacher access removed');
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

  const handleDeleteClass = () => {
    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class? This will permanently delete all students and their records. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!classId || !user) return;
            setDeleting(true);
            try {
              await deleteClass(classId);
              Alert.alert('Class Deleted', 'The class and all its records have been deleted.', [
                { text: 'OK', onPress: () => router.replace('/(teacher)/classes') },
              ]);
            } catch (error) {
              console.error('Error deleting class:', error);
              setError('Failed to delete class. Please try again.');
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
              iconColor={colors.onPrimary}
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
              <Text variant={typography.h4} style={styles.sectionTitle}>
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

              {hasClassChanges && (
                <View style={styles.classActions}>
                  <Button onPress={handleSubmit(onSubmit)} loading={saving}>
                    Save Changes
                  </Button>
                  <Button mode="outlined" onPress={handleCancelEdit}>
                    Cancel
                  </Button>
                </View>
              )}
            </View>

            <Divider style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.adminHeader}>
                <Text variant={typography.h4} style={styles.sectionTitle}>
                  Teacher Access
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

              <Text variant={typography.caption} style={styles.adminNote}>
                Invited teachers can view and manage students, homework, and attendance for this class.
              </Text>

              {showAddAdmin && (
                <View style={styles.addAdminSection}>
                  <Input
                    control={control}
                    name="newAdminEmail"
                    label="Teacher Email"
                    placeholder="teacher@example.com"
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
                      Add Teacher
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
                <Text variant={typography.body} style={styles.noAdmins}>
                  No other teachers added yet
                </Text>
              ) : (
                admins.map((admin, index) => (
                  <View key={admin.email} style={styles.adminItem}>
                    <View style={styles.adminInfo}>
                      <Text variant={typography.body} style={styles.adminEmail}>
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

            {isOwner && (
              <>
                <Divider style={styles.dangerDivider} />
                <View style={styles.dangerZone}>
                  <Text variant={typography.h4} style={styles.dangerTitle}>
                    Danger Zone
                  </Text>
                  <Text variant={typography.caption} style={styles.dangerNote}>
                    Deleting this class will permanently remove all students and their homework/attendance records.
                  </Text>
                  <Button
                    mode="outlined"
                    onPress={handleDeleteClass}
                    loading={deleting}
                    textColor={colors.danger}
                    style={styles.deleteButton}
                  >
                    Delete Class
                  </Button>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <AppSnackbar message={error} onDismiss={() => setError(null)} />
        <AppSnackbar type="success" message={success} onDismiss={() => setSuccess(null)} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  divider: {
    marginVertical: spacing.lg,
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  adminNote: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  addAdminSection: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  addAdminActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addButton: {
    flex: 1,
  },
  noAdmins: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  adminItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  adminInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adminEmail: {
    flex: 1,
  },
  statusChip: {
    marginLeft: spacing.xs,
  },
  acceptedChip: {
    backgroundColor: colors.successSoft,
  },
  statusText: {
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
  },
  classActions: {
    marginTop: spacing.sm,
  },
  dangerDivider: {
    marginTop: 32,
    marginBottom: spacing.lg,
  },
  dangerZone: {
    padding: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    marginBottom: 32,
  },
  dangerTitle: {
    fontWeight: fontWeight.semibold,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  dangerNote: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  deleteButton: {
    borderColor: colors.danger,
  },
});
