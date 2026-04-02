import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import {
  List,
  Divider,
  Text,
  Avatar,
  Portal,
  Modal,
  TextInput,
  IconButton,
  Switch,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/common';
import { firestore } from '../../src/config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { removePushToken } from '../../src/services/notification.service';
import { getClassesByIds } from '../../src/services/class.service';
import { Class } from '../../src/types';

export default function TeacherSettingsScreen() {
  const { user, signOut, refreshUser, resetPassword, registerPushNotifications, deleteTeacherAccount } = useAuth();
  const [showEditName, setShowEditName] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [saving, setSaving] = useState(false);
  const [togglingNotifications, setTogglingNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [ownedClasses, setOwnedClasses] = useState<Class[]>([]);
  const [adminClasses, setAdminClasses] = useState<Class[]>([]);

  const notificationsEnabled = user?.notificationsEnabled ?? false;

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user) return;
      try {
        if (user.classIds?.length) {
          const owned = await getClassesByIds(user.classIds);
          setOwnedClasses(owned);
        }
      } catch (err) {
        console.error('Failed to fetch owned classes:', err);
      }
      try {
        if (user.adminClassIds?.length) {
          const admin = await getClassesByIds(user.adminClassIds);
          const verified = admin.filter((cls) =>
            cls.admins?.some((a) => a.userId === user.uid)
          );
          setAdminClasses(verified);
        }
      } catch (err) {
        console.error('Failed to fetch admin classes:', err);
      }
    };
    fetchClasses();
  }, [user?.classIds, user?.adminClassIds]);

  const handleToggleNotifications = async () => {
    if (!user || togglingNotifications) return;

    setTogglingNotifications(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);

      if (notificationsEnabled) {
        // Disable notifications - remove push token
        await removePushToken(user.uid);
        await updateDoc(userRef, { notificationsEnabled: false });
      } else {
        // Enable notifications - register and save token
        await registerPushNotifications();
        await updateDoc(userRef, { notificationsEnabled: true });
      }
      await refreshUser();
    } catch (error) {
      console.error('Error toggling notifications:', error);
      Alert.alert('Error', 'Failed to update notification settings.');
    } finally {
      setTogglingNotifications(false);
    }
  };

  const handleChangePassword = () => {
    if (!user?.email) return;

    Alert.alert(
      'Change Password',
      `We'll send a password reset link to ${user.email}. You can use that link to set a new password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: async () => {
            try {
              await resetPassword(user.email);
              Alert.alert(
                'Email Sent',
                'Check your inbox for the password reset link. Remember to check spam/junk folder.'
              );
            } catch (error) {
              console.error('Error sending password reset:', error);
              Alert.alert('Error', 'Failed to send password reset email. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            console.error('Sign out error:', error);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }

    setDeleting(true);
    try {
      await deleteTeacherAccount(deletePassword);
    } catch (error: any) {
      console.error('Delete account error:', error);
      if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        Alert.alert('Incorrect Password', 'The password you entered is incorrect. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete account. Please try again.');
      }
      setDeleting(false);
    }
  };

  const openDeleteConfirm = () => {
    setDeletePassword('');
    setShowDeleteConfirm(true);
  };

  const openEditName = () => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
    setShowEditName(true);
  };

  const handleSaveName = async () => {
    if (!user || !firstName.trim() || !lastName.trim()) {
      Alert.alert('Error', 'Please enter both first and last name');
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await refreshUser();
      setShowEditName(false);
    } catch (error) {
      console.error('Error updating name:', error);
      Alert.alert('Error', 'Failed to update name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '??';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.profileSection}>
          <Avatar.Text size={80} label={initials} style={styles.avatar} />
          <View style={styles.nameRow}>
            <Text variant="headlineSmall" style={styles.name}>
              {user?.firstName} {user?.lastName}
            </Text>
            <IconButton
              icon="pencil"
              size={18}
              onPress={openEditName}
              style={styles.editButton}
            />
          </View>
          <Text variant="bodyMedium" style={styles.email}>
            {user?.email}
          </Text>
          <Text variant="bodySmall" style={styles.role}>
            Teacher
          </Text>
        </View>

        <Divider />

        <List.Section>
          <List.Subheader>Account</List.Subheader>
          <List.Item
            title="Change Password"
            left={(props) => <List.Icon {...props} icon="lock" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={handleChangePassword}
          />
        </List.Section>

        <Divider />

        <List.Section>
          <List.Subheader>App</List.Subheader>
          <List.Item
            title="Notifications"
            description={notificationsEnabled ? 'Enabled' : 'Disabled'}
            left={(props) => <List.Icon {...props} icon="bell" />}
            right={() => (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                disabled={togglingNotifications}
              />
            )}
          />
          <List.Item
            title="Help & Support"
            left={(props) => <List.Icon {...props} icon="help-circle" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/(teacher)/help')}
          />
        </List.Section>

        <Divider />

        <List.Section>
          <List.Item
            title="Sign Out"
            titleStyle={styles.signOutText}
            left={(props) => (
              <List.Icon {...props} icon="logout" color="#d32f2f" />
            )}
            onPress={handleSignOut}
          />
        </List.Section>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text variant="titleMedium" style={styles.dangerTitle}>
            Danger Zone
          </Text>
          <Text variant="bodySmall" style={styles.dangerNote}>
            Permanently delete your account, all your classes, students, and their records. This cannot be undone.
          </Text>
          <Button
            mode="outlined"
            onPress={openDeleteConfirm}
            textColor="#d32f2f"
            style={styles.deleteButton}
            icon="delete"
          >
            Delete Account
          </Button>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Portal>
        <Modal
          visible={showEditName}
          onDismiss={() => setShowEditName(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            Edit Name
          </Text>

          <TextInput
            label="First Name"
            value={firstName}
            onChangeText={setFirstName}
            mode="outlined"
            style={styles.input}
            autoCapitalize="words"
          />

          <TextInput
            label="Last Name"
            value={lastName}
            onChangeText={setLastName}
            mode="outlined"
            style={styles.input}
            autoCapitalize="words"
          />

          <View style={styles.modalActions}>
            <Button onPress={handleSaveName} loading={saving}>
              Save
            </Button>
            <Button mode="outlined" onPress={() => setShowEditName(false)}>
              Cancel
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Delete Account Confirmation Modal */}
      <Portal>
        <Modal
          visible={showDeleteConfirm}
          onDismiss={() => !deleting && setShowDeleteConfirm(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant="titleLarge" style={styles.deleteModalTitle}>
            Delete Account?
          </Text>

          {ownedClasses.length > 0 && (
            <View style={styles.classListContainer}>
              <Text variant="bodyMedium" style={styles.deleteModalText}>
                The following classes and ALL their data will be permanently deleted:
              </Text>
              {ownedClasses.map((cls) => (
                <Text key={cls.id} variant="bodyMedium" style={styles.classListItem}>
                  {'\u2022'} {cls.name} ({cls.studentCount} student{cls.studentCount !== 1 ? 's' : ''})
                </Text>
              ))}
            </View>
          )}

          {adminClasses.length > 0 && (
            <View style={styles.classListContainer}>
              <Text variant="bodyMedium" style={styles.deleteModalText}>
                You will be removed as co-teacher from:
              </Text>
              {adminClasses.map((cls) => (
                <Text key={cls.id} variant="bodyMedium" style={styles.classListItem}>
                  {'\u2022'} {cls.name}
                </Text>
              ))}
            </View>
          )}

          <Text variant="bodyMedium" style={styles.deleteModalWarning}>
            This action cannot be undone.
          </Text>

          <TextInput
            label="Enter your password to confirm"
            value={deletePassword}
            onChangeText={setDeletePassword}
            mode="outlined"
            secureTextEntry
            style={styles.passwordInput}
            autoCapitalize="none"
          />

          <View style={styles.modalActions}>
            <Button
              mode="contained"
              buttonColor="#d32f2f"
              textColor="#fff"
              onPress={handleDeleteAccount}
              loading={deleting}
              disabled={deleting || !deletePassword.trim()}
            >
              Yes, Delete My Account
            </Button>
            <Button
              mode="outlined"
              onPress={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </View>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  profileSection: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  avatar: {
    backgroundColor: '#1a73e8',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  name: {
    fontWeight: '600',
  },
  editButton: {
    margin: 0,
  },
  email: {
    color: '#666',
    marginTop: 4,
  },
  role: {
    color: '#1a73e8',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  signOutText: {
    color: '#d32f2f',
  },
  dangerZone: {
    margin: 16,
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
  deleteModalTitle: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: '#d32f2f',
  },
  deleteModalText: {
    color: '#444',
    textAlign: 'center',
    marginBottom: 8,
  },
  deleteModalWarning: {
    color: '#d32f2f',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
  },
  classListContainer: {
    marginBottom: 8,
  },
  classListItem: {
    color: '#444',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 2,
  },
  passwordInput: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  modalActions: {
    marginTop: 8,
  },
});
