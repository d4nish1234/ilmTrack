import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import { router, type Href } from 'expo-router';
import { List, Divider, Text, Avatar, Portal, Modal, TextInput, IconButton, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { AppSnackbar, Button } from '../common';
import { firestore } from '../../config/firebase';
import { removePushToken } from '../../services/notification.service';
import { colors, fontWeight, radius, spacing, typography } from '../../constants/theme';

interface SettingsScreenProps {
  /** Under the email: 'Teacher' or 'Parent'. */
  roleLabel: string;
  helpHref: Href;
  /** The Danger Zone's line: what deleting the account removes. */
  deleteSummary: string;
  /** Deletes the account (re-authenticating with the password). */
  deleteAccount: (password: string) => Promise<void>;
  /** What the role loses, shown in the delete confirmation: DeleteList and DeleteNote. */
  deleteDetails?: React.ReactNode;
}

/**
 * The Settings tab, shared by teachers and parents: profile (edit name),
 * change password, notifications, help, sign out, and delete account. Each
 * role's route passes only what differs: its label, help page, and what
 * deleting the account takes with it.
 */
export function SettingsScreen({ roleLabel, helpHref, deleteSummary, deleteAccount, deleteDetails }: SettingsScreenProps) {
  const { user, signOut, refreshUser, resetPassword, registerPushNotifications } = useAuth();
  const [showEditName, setShowEditName] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [saving, setSaving] = useState(false);
  const [togglingNotifications, setTogglingNotifications] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const notificationsEnabled = user?.notificationsEnabled ?? false;

  const handleToggleNotifications = async () => {
    if (!user || togglingNotifications) return;

    setTogglingNotifications(true);
    try {
      const userRef = doc(firestore, 'users', user.uid);
      if (notificationsEnabled) {
        // Off: forget this phone's push token.
        await removePushToken(user.uid);
        await updateDoc(userRef, { notificationsEnabled: false });
      } else {
        await registerPushNotifications();
        await updateDoc(userRef, { notificationsEnabled: true });
      }
      await refreshUser();
    } catch (error) {
      console.error('Error toggling notifications:', error);
      setMessage({ text: "Couldn't change notifications. Please try again.", type: 'error' });
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
              setMessage({ text: 'Password reset link sent. Check your inbox and spam folder.', type: 'success' });
            } catch (error) {
              console.error('Error sending password reset:', error);
              setMessage({ text: "Couldn't send the reset link. Please try again.", type: 'error' });
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
      // On success the account is gone and the app leaves this screen.
      await deleteAccount(deletePassword);
    } catch (error) {
      console.error('Delete account error:', error);
      const code = (error as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
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
      await updateDoc(doc(firestore, 'users', user.uid), {
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

  const initials = user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : '??';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.profileSection}>
          <Avatar.Text size={80} label={initials} style={styles.avatar} />
          <View style={styles.nameRow}>
            <Text variant={typography.h2} style={styles.name}>
              {user?.firstName} {user?.lastName}
            </Text>
            <IconButton icon="pencil" size={18} onPress={openEditName} style={styles.editButton} />
          </View>
          <Text variant={typography.body} style={styles.email}>
            {user?.email}
          </Text>
          <Text variant={typography.caption} style={styles.role}>
            {roleLabel}
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
            onPress={() => router.push(helpHref)}
          />
        </List.Section>

        <Divider />

        <List.Section>
          <List.Item
            title="Sign Out"
            titleStyle={styles.signOutText}
            left={(props) => <List.Icon {...props} icon="logout" color={colors.danger} />}
            onPress={handleSignOut}
          />
        </List.Section>

        <View style={styles.dangerZone}>
          <Text variant={typography.h4} style={styles.dangerTitle}>
            Danger Zone
          </Text>
          <Text variant={typography.caption} style={styles.dangerNote}>
            {deleteSummary}
          </Text>
          <Button
            mode="outlined"
            onPress={openDeleteConfirm}
            textColor={colors.danger}
            style={styles.deleteButton}
            icon="delete"
          >
            Delete Account
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Modal
          visible={showEditName}
          onDismiss={() => setShowEditName(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant={typography.h3} style={styles.modalTitle}>
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

      <Portal>
        <Modal
          visible={showDeleteConfirm}
          onDismiss={() => !deleting && setShowDeleteConfirm(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant={typography.h3} style={styles.deleteModalTitle}>
            Delete Account?
          </Text>

          {deleteDetails}

          <TextInput
            label="Enter your password to confirm"
            value={deletePassword}
            onChangeText={setDeletePassword}
            mode="outlined"
            secureTextEntry
            style={styles.input}
            autoCapitalize="none"
          />

          <View style={styles.modalActions}>
            <Button
              buttonColor={colors.danger}
              textColor={colors.onPrimary}
              onPress={handleDeleteAccount}
              loading={deleting}
              disabled={deleting || !deletePassword.trim()}
            >
              Yes, Delete My Account
            </Button>
            <Button mode="outlined" onPress={() => setShowDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
          </View>
        </Modal>
      </Portal>

      <AppSnackbar type={message?.type} message={message?.text ?? null} onDismiss={() => setMessage(null)} />
    </SafeAreaView>
  );
}

/** A heading and bulleted list in the delete confirmation: what will be deleted or lost. */
export function DeleteList({ heading, items }: { heading: string; items: { key: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      <Text variant={typography.body} style={styles.deleteText}>
        {heading}
      </Text>
      {items.map((item) => (
        <Text key={item.key} variant={typography.body} style={styles.listItem}>
          {'•'} {item.label}
        </Text>
      ))}
    </View>
  );
}

/** A closing line in the delete confirmation; `warning` makes it red and bold. */
export function DeleteNote({ children, warning }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <Text variant={typography.body} style={[styles.deleteText, warning && styles.deleteWarning]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileSection: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
  },
  avatar: {
    backgroundColor: colors.primary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  name: {
    fontWeight: fontWeight.semibold,
  },
  editButton: {
    margin: 0,
  },
  email: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  role: {
    color: colors.primary,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  signOutText: {
    color: colors.danger,
  },
  dangerZone: {
    margin: spacing.lg,
    marginBottom: 32,
    padding: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
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
  deleteModalTitle: {
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.lg,
    color: colors.danger,
  },
  deleteText: {
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  deleteWarning: {
    color: colors.danger,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  list: {
    marginBottom: spacing.sm,
  },
  listItem: {
    color: colors.text,
    textAlign: 'center',
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  modalContainer: {
    backgroundColor: colors.card,
    margin: 20,
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  modalTitle: {
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  modalActions: {
    marginTop: spacing.sm,
  },
});
