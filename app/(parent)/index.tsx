import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, Linking, Platform, AppState } from 'react-native';
import { Text, Card, Chip, IconButton } from 'react-native-paper';
import { router, useNavigation } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../src/contexts/AuthContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Homework, Attendance } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { colors, fontSize, fontWeight, radius, spacing, statusColor, typography } from '../../src/constants/theme';

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

export default function ParentHomeScreen() {
  const { user, checkForNewInvites } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [recentHomework, setRecentHomework] = useState<Homework[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [systemNotificationsDisabled, setSystemNotificationsDisabled] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerReady, setBannerReady] = useState(false);

  // App-level notification preference
  const appNotificationsDisabled = user?.notificationsEnabled !== true;

  // Check system notification permission status
  const checkNotificationPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setSystemNotificationsDisabled(status !== 'granted');
  }, []);

  // Delay banner display by 15 seconds so first-time users can grant permission
  useEffect(() => {
    checkNotificationPermission();
    const timer = setTimeout(() => setBannerReady(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  // Re-check permission when app returns to foreground (after user grants in system settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkNotificationPermission();
      }
    });
    return () => subscription.remove();
  }, [checkNotificationPermission]);

  const openSystemSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const openAppSettings = () => {
    router.push('/(parent)/settings');
  };

  // Determine which banner to show (system takes priority)
  const showSystemBanner = bannerReady && systemNotificationsDisabled && !bannerDismissed;
  const showAppBanner = bannerReady && !systemNotificationsDisabled && appNotificationsDisabled && !bannerDismissed;

  const fetchData = useCallback(async () => {
    if (!user?.studentIds?.length) {
      setLoading(false);
      return;
    }

    try {
      const studentDocs = await Promise.all(
        user.studentIds!.map((id) =>
          getDoc(doc(firestore, 'students', id)).catch(() => null)
        )
      );

      const studentList = studentDocs
        .filter((docSnap) => docSnap?.exists())
        .map((docSnap) => ({ id: docSnap!.id, ...docSnap!.data() })) as Student[];

      setStudents(studentList);

      if (user?.uid) {
        // Query homework where parent's uid is in parentUserIds array
        const homeworkRef = collection(firestore, 'homework');
        const homeworkQuery = query(
          homeworkRef,
          where('parentUserIds', 'array-contains', user.uid),
          limit(20)
        );
        const homeworkSnapshot = await getDocs(homeworkQuery);

        const homeworkList = homeworkSnapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Homework[];
        // Sort client-side by createdAt desc, take top 5
        homeworkList.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        setRecentHomework(homeworkList.slice(0, 5));

        // Query attendance where parent's uid is in parentUserIds array
        const attendanceRef = collection(firestore, 'attendance');
        const attendanceQuery = query(
          attendanceRef,
          where('parentUserIds', 'array-contains', user.uid),
          limit(20)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);

        const attendanceList = attendanceSnapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Attendance[];
        // Sort client-side by date desc, take top 5
        attendanceList.sort((a, b) => {
          const aTime = a.date?.toMillis?.() ?? 0;
          const bTime = b.date?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        setRecentAttendance(attendanceList.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.studentIds, user?.uid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Check for new invites (auto-links new students if found)
    await checkForNewInvites();
    // Then fetch the data (which will include any newly linked students)
    fetchData();
  }, [fetchData, checkForNewInvites]);

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="refresh"
          iconColor={colors.onPrimary}
          size={24}
          onPress={onRefresh}
          disabled={refreshing}
        />
      ),
    });
  }, [navigation, onRefresh, refreshing]);

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };


  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!user?.studentIds?.length) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text variant={typography.h4} style={styles.emptyTitle}>
          Welcome, {user?.firstName}!
        </Text>
        <Text variant={typography.body} style={styles.emptyMessage}>
          You&apos;re not linked to any students yet. Please wait for a teacher to
          send you an invitation.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text variant={typography.h2} style={styles.greeting}>
          Welcome, {user?.firstName}!
        </Text>
      </View>

      {/* System notification permission banner */}
      {showSystemBanner && (
        <View style={styles.notificationBanner}>
          <View style={styles.bannerContent}>
            <Text variant={typography.caption} style={styles.bannerText}>
              Notifications are disabled. You won&apos;t receive homework alerts.
            </Text>
            <Text
              variant={typography.labelSmall}
              style={styles.bannerLink}
              onPress={openSystemSettings}
            >
              Enable in Settings
            </Text>
          </View>
          <IconButton
            icon="close"
            size={16}
            onPress={() => setBannerDismissed(true)}
            style={styles.bannerClose}
          />
        </View>
      )}

      {/* App notification preference banner */}
      {showAppBanner && (
        <View style={styles.notificationBanner}>
          <View style={styles.bannerContent}>
            <Text variant={typography.caption} style={styles.bannerText}>
              Notifications are turned off. You won&apos;t receive homework alerts.
            </Text>
            <Text
              variant={typography.labelSmall}
              style={styles.bannerLink}
              onPress={openAppSettings}
            >
              Enable in App Settings
            </Text>
          </View>
          <IconButton
            icon="close"
            size={16}
            onPress={() => setBannerDismissed(true)}
            style={styles.bannerClose}
          />
        </View>
      )}

      {/* Students - deduplicated by name (same child in multiple classes shows once) */}
      <Card style={styles.card}>
        <Card.Title title="Your Children" />
        <Card.Content>
          {deduplicateStudentsByName(students).map((student) => (
            <View key={student.id} style={styles.studentItem}>
              <Text variant={typography.h4}>
                {student.firstName} {student.lastName}
              </Text>
            </View>
          ))}
        </Card.Content>
      </Card>

      {/* Recent Homework */}
      <Card style={styles.card}>
        <Card.Title title="Recent Homework" />
        <Card.Content>
          {recentHomework.length > 0 ? (
            recentHomework.map((hw) => (
              <View key={hw.id} style={styles.listItem}>
                <View style={styles.itemInfo}>
                  <Text variant={typography.h5}>{hw.title}</Text>
                  <Text variant={typography.caption} style={styles.subtext}>
                    {getStudentName(hw.studentId)} -{' '}
                    {hw.createdAt ? format(hw.createdAt.toDate(), 'MMM d') : 'Just now'}
                  </Text>
                </View>
                <Chip
                  compact
                  style={{ backgroundColor: statusColor(hw.status) }}
                  textStyle={{ color: colors.onPrimary, fontSize: fontSize.xs }}
                >
                  {hw.status}
                </Chip>
              </View>
            ))
          ) : (
            <Text style={styles.noData}>No homework assigned yet</Text>
          )}
        </Card.Content>
      </Card>

      {/* Recent Attendance */}
      <Card style={styles.card}>
        <Card.Title title="Recent Attendance" />
        <Card.Content>
          {recentAttendance.length > 0 ? (
            recentAttendance.map((att) => (
              <View key={att.id} style={styles.listItem}>
                <View style={styles.itemInfo}>
                  <Text variant={typography.h5}>
                    {att.date ? format(att.date.toDate(), 'EEEE, MMM d') : 'Today'}
                  </Text>
                  <Text variant={typography.caption} style={styles.subtext}>
                    {getStudentName(att.studentId)}
                  </Text>
                </View>
                <Chip
                  compact
                  style={{ backgroundColor: statusColor(att.status) }}
                  textStyle={{ color: colors.onPrimary, fontSize: fontSize.xs }}
                >
                  {att.status}
                </Chip>
              </View>
            ))
          ) : (
            <Text style={styles.noData}>No attendance records yet</Text>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    fontWeight: fontWeight.semibold,
  },
  card: {
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.card,
  },
  studentItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemInfo: {
    flex: 1,
  },
  subtext: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  noData: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.lg,
  },
  emptyMessage: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.star,
  },
  bannerContent: {
    flex: 1,
  },
  bannerText: {
    color: colors.warning,
  },
  bannerLink: {
    color: colors.primary,
    marginTop: spacing.xs,
    textDecorationLine: 'underline',
  },
  bannerClose: {
    margin: 0,
  },
});
