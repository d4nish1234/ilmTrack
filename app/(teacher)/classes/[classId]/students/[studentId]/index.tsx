import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, ScrollView, useWindowDimensions } from 'react-native';
import { Text, Card, Chip, IconButton, Menu, Portal } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { subscribeToStudent, getUserById } from '../../../../../../src/services/student.service';
import { subscribeToHomework } from '../../../../../../src/services/homework.service';
import { subscribeToAttendance } from '../../../../../../src/services/attendance.service';
import { LoadingSpinner, Button } from '../../../../../../src/components/common';
import { Student, Homework, Attendance, Parent } from '../../../../../../src/types';
import { format } from 'date-fns';

interface ParentDisplayInfo {
  firstName: string;
  lastName: string;
  email: string;
  inviteStatus: string;
}

export default function StudentDetailScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { width: windowWidth } = useWindowDimensions();
  const [student, setStudent] = useState<Student | null>(null);
  const [parentDisplayInfo, setParentDisplayInfo] = useState<ParentDisplayInfo[]>([]);
  const [recentHomework, setRecentHomework] = useState<Homework[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuActionRef = useRef(0);

  // Fetch parent names from user profiles when they've signed up
  const fetchParentDisplayInfo = async (parents: Parent[]) => {
    const displayInfo: ParentDisplayInfo[] = await Promise.all(
      parents.map(async (parent) => {
        // If parent has signed up, get their name from user profile
        if (parent.userId) {
          const user = await getUserById(parent.userId);
          if (user) {
            return {
              firstName: user.firstName,
              lastName: user.lastName,
              email: parent.email,
              inviteStatus: parent.inviteStatus,
            };
          }
        }
        // Fall back to the name teacher entered
        return {
          firstName: parent.firstName,
          lastName: parent.lastName,
          email: parent.email,
          inviteStatus: parent.inviteStatus,
        };
      })
    );
    setParentDisplayInfo(displayInfo);
  };

  useEffect(() => {
    if (!studentId) return;

    const unsubStudent = subscribeToStudent(
      studentId,
      (data) => {
        setStudent(data);
        if (data?.parents) {
          fetchParentDisplayInfo(data.parents);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching student:', error);
        setLoading(false);
      }
    );

    const unsubHomework = subscribeToHomework(
      studentId,
      (data) => setRecentHomework(data.slice(0, 3)),
      console.error
    );

    const unsubAttendance = subscribeToAttendance(
      studentId,
      (data) => setRecentAttendance(data.slice(0, 5)),
      console.error
    );

    return () => {
      unsubStudent();
      unsubHomework();
      unsubAttendance();
    };
  }, [studentId]);

  // Menu handlers - increment key on open to force fresh Menu state
  const MENU_DEBOUNCE_MS = 300;

  const openMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastMenuActionRef.current < MENU_DEBOUNCE_MS) {
      return; // Ignore rapid open attempts
    }
    lastMenuActionRef.current = now;
    setMenuKey((k) => k + 1); // Force Menu remount for fresh state
    setMenuVisible(true);
  }, []);

  const closeMenu = useCallback(() => {
    // Always allow close, but record the time to prevent immediate reopen
    lastMenuActionRef.current = Date.now();
    setMenuVisible(false);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return '#4caf50';
      case 'absent':
        return '#f44336';
      case 'late':
        return '#ff9800';
      case 'excused':
        return '#2196f3';
      default:
        return '#666';
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading student..." />;
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
          title: `${student.firstName} ${student.lastName}`,
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor="#fff"
              size={24}
              onPress={() => router.back()}
              style={styles.headerButton}
            />
          ),
          headerRight: () => (
            <IconButton
              icon="dots-vertical"
              iconColor="#fff"
              size={24}
              onPress={openMenu}
              style={styles.headerButton}
            />
          ),
        }}
      />

      {/* Menu rendered with Portal for proper z-index */}
      <Portal>
        <Menu
          key={menuKey}
          visible={menuVisible}
          onDismiss={closeMenu}
          anchor={{ x: windowWidth - 16, y: 56 }}
          anchorPosition="bottom"
          contentStyle={styles.menuContent}
        >
          <Menu.Item
            onPress={() => {
              closeMenu();
              router.push(`/(teacher)/classes/${classId}/students/${studentId}/edit`);
            }}
            title="Edit Student"
            leadingIcon="pencil"
          />
        </Menu>
      </Portal>

      <ScrollView style={styles.container}>
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Button
            mode="contained"
            icon="clipboard-check"
            onPress={() =>
              router.push(
                `/(teacher)/classes/${classId}/students/${studentId}/attendance/add`
              )
            }
            style={styles.actionButton}
          >
            Add Attendance
          </Button>
          <Button
            mode="contained"
            icon="book"
            onPress={() =>
              router.push(
                `/(teacher)/classes/${classId}/students/${studentId}/homework/add`
              )
            }
            style={styles.actionButton}
          >
            Add Homework
          </Button>
        </View>

        {/* Parents Section */}
        <Card style={styles.card}>
          <Card.Title
            title="Parents/Guardians"
            right={() => (
              <Button
                mode="text"
                onPress={() =>
                  router.push(
                    `/(teacher)/classes/${classId}/students/${studentId}/parents`
                  )
                }
              >
                Edit
              </Button>
            )}
          />
          <Card.Content>
            {parentDisplayInfo.map((parent, index) => (
              <View key={index} style={styles.parentItem}>
                <View style={styles.parentInfo}>
                  <Text variant="titleSmall">
                    {parent.firstName} {parent.lastName}
                  </Text>
                  <Text variant="bodySmall" style={styles.email}>
                    {parent.email}
                  </Text>
                </View>
                <Chip
                  compact
                  mode="outlined"
                  textStyle={styles.inviteStatus}
                  style={[
                    styles.statusChip,
                    parent.inviteStatus === 'accepted' && styles.acceptedChip,
                  ]}
                >
                  {parent.inviteStatus}
                </Chip>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Recent Attendance */}
        <Card style={styles.card}>
          <Card.Title
            title="Recent Attendance"
            right={() => (
              <Button
                mode="text"
                onPress={() =>
                  router.push(
                    `/(teacher)/classes/${classId}/students/${studentId}/attendance`
                  )
                }
              >
                View All
              </Button>
            )}
          />
          <Card.Content>
            {recentAttendance.length > 0 ? (
              recentAttendance.map((record) => (
                <View key={record.id} style={styles.recordItem}>
                  <Text variant="bodyMedium">
                    {record.date ? format(record.date.toDate(), 'MMM d, yyyy') : 'Today'}
                  </Text>
                  <Chip
                    compact
                    style={{ backgroundColor: getStatusColor(record.status) }}
                    textStyle={{ color: '#fff' }}
                  >
                    {record.status}
                  </Chip>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No attendance records yet</Text>
            )}
          </Card.Content>
        </Card>

        {/* Recent Homework */}
        <Card style={styles.card}>
          <Card.Title
            title="Recent Homework"
            right={() => (
              <Button
                mode="text"
                onPress={() =>
                  router.push(
                    `/(teacher)/classes/${classId}/students/${studentId}/homework`
                  )
                }
              >
                View All
              </Button>
            )}
          />
          <Card.Content>
            {recentHomework.length > 0 ? (
              recentHomework.map((hw) => (
                <View key={hw.id} style={styles.homeworkItem}>
                  <View style={styles.homeworkInfo}>
                    <Text variant="titleSmall">{hw.title}</Text>
                    <Text variant="bodySmall" style={styles.date}>
                      {hw.createdAt ? format(hw.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
                    </Text>
                  </View>
                  <Chip compact mode="outlined">
                    {hw.status}
                  </Chip>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No homework assigned yet</Text>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  parentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  parentInfo: {
    flex: 1,
  },
  email: {
    color: '#666',
    marginTop: 2,
  },
  statusChip: {
    marginLeft: 8,
  },
  acceptedChip: {
    backgroundColor: '#e8f5e9',
  },
  inviteStatus: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  recordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  homeworkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  homeworkInfo: {
    flex: 1,
  },
  date: {
    color: '#666',
    marginTop: 2,
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
  },
  menuContent: {
    backgroundColor: '#fff',
  },
  headerButton: {
    margin: 0,
  },
});
