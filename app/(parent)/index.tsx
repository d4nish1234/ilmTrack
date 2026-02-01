import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, Linking, Platform } from 'react-native';
import { Text, Card, Chip, IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../src/contexts/AuthContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Homework, Attendance } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { format } from 'date-fns';

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

  // App-level notification preference
  const appNotificationsDisabled = user?.notificationsEnabled === false;

  // Check system notification permission status
  useEffect(() => {
    const checkNotificationPermission = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setSystemNotificationsDisabled(status !== 'granted');
    };
    checkNotificationPermission();
  }, []);

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
  const showSystemBanner = systemNotificationsDisabled && !bannerDismissed;
  const showAppBanner = !systemNotificationsDisabled && appNotificationsDisabled && !bannerDismissed;

  const fetchData = useCallback(async () => {
    if (!user?.studentIds?.length) {
      setLoading(false);
      return;
    }

    try {
      const studentDocs = await Promise.all(
        user.studentIds!.map((id) =>
          getDoc(doc(firestore, 'students', id))
        )
      );

      const studentList = studentDocs
        .filter((docSnap) => docSnap.exists())
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Student[];

      setStudents(studentList);

      if (studentList.length > 0) {
        const studentIds = studentList.map((s) => s.id);

        const homeworkRef = collection(firestore, 'homework');
        const homeworkQuery = query(
          homeworkRef,
          where('studentId', 'in', studentIds),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const homeworkSnapshot = await getDocs(homeworkQuery);

        setRecentHomework(
          homeworkSnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Homework[]
        );

        const attendanceRef = collection(firestore, 'attendance');
        const attendanceQuery = query(
          attendanceRef,
          where('studentId', 'in', studentIds),
          orderBy('date', 'desc'),
          limit(5)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);

        setRecentAttendance(
          attendanceSnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Attendance[]
        );
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.studentIds]);

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

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
      case 'completed':
        return '#4caf50';
      case 'absent':
      case 'incomplete':
        return '#f44336';
      case 'late':
        return '#ff9800';
      case 'excused':
      case 'assigned':
        return '#2196f3';
      default:
        return '#666';
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!user?.studentIds?.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="titleMedium" style={styles.emptyTitle}>
          Welcome, {user?.firstName}!
        </Text>
        <Text variant="bodyMedium" style={styles.emptyMessage}>
          You&apos;re not linked to any students yet. Please wait for a teacher to
          send you an invitation.
        </Text>
      </View>
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
        <Text variant="headlineSmall" style={styles.greeting}>
          Welcome, {user?.firstName}!
        </Text>
      </View>

      {/* System notification permission banner */}
      {showSystemBanner && (
        <View style={styles.notificationBanner}>
          <View style={styles.bannerContent}>
            <Text variant="bodySmall" style={styles.bannerText}>
              Notifications are disabled. You won&apos;t receive homework alerts.
            </Text>
            <Text
              variant="labelSmall"
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
            <Text variant="bodySmall" style={styles.bannerText}>
              Notifications are turned off. You won&apos;t receive homework alerts.
            </Text>
            <Text
              variant="labelSmall"
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
              <Text variant="titleMedium">
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
                  <Text variant="titleSmall">{hw.title}</Text>
                  <Text variant="bodySmall" style={styles.subtext}>
                    {getStudentName(hw.studentId)} -{' '}
                    {hw.createdAt ? format(hw.createdAt.toDate(), 'MMM d') : 'Just now'}
                  </Text>
                </View>
                <Chip
                  compact
                  style={{ backgroundColor: getStatusColor(hw.status) }}
                  textStyle={{ color: '#fff', fontSize: 10 }}
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
                  <Text variant="titleSmall">
                    {att.date ? format(att.date.toDate(), 'EEEE, MMM d') : 'Today'}
                  </Text>
                  <Text variant="bodySmall" style={styles.subtext}>
                    {getStudentName(att.studentId)}
                  </Text>
                </View>
                <Chip
                  compact
                  style={{ backgroundColor: getStatusColor(att.status) }}
                  textStyle={{ color: '#fff', fontSize: 10 }}
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
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  greeting: {
    fontWeight: '600',
  },
  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
  },
  studentItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
  },
  subtext: {
    color: '#666',
    marginTop: 2,
  },
  noData: {
    color: '#666',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyMessage: {
    color: '#666',
    textAlign: 'center',
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    marginHorizontal: 16,
    marginTop: 12,
    paddingLeft: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
  },
  bannerContent: {
    flex: 1,
  },
  bannerText: {
    color: '#856404',
  },
  bannerLink: {
    color: '#1a73e8',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  bannerClose: {
    margin: 0,
  },
});
