import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { Text, Card, List, Chip, Divider, IconButton, Menu, Portal } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { subscribeToStudent, deleteStudent } from '../../../../../../src/services/student.service';
import { subscribeToHomework } from '../../../../../../src/services/homework.service';
import { subscribeToAttendance } from '../../../../../../src/services/attendance.service';
import { LoadingSpinner, Button } from '../../../../../../src/components/common';
import { Student, Homework, Attendance } from '../../../../../../src/types';
import { format } from 'date-fns';

export default function StudentDetailScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { width: windowWidth } = useWindowDimensions();
  const [student, setStudent] = useState<Student | null>(null);
  const [recentHomework, setRecentHomework] = useState<Homework[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (!studentId) return;

    const unsubStudent = subscribeToStudent(
      studentId,
      (data) => {
        setStudent(data);
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

  const handleDelete = () => {
    Alert.alert(
      'Delete Student',
      'Are you sure you want to delete this student? This will also delete all their homework and attendance records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!studentId || !classId) return;
            try {
              await deleteStudent(studentId, classId);
              router.back();
            } catch (error) {
              console.error('Error deleting student:', error);
              Alert.alert('Error', 'Failed to delete student');
            }
          },
        },
      ]
    );
  };

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
              onPress={() => setMenuVisible(true)}
              style={styles.headerButton}
            />
          ),
        }}
      />

      {/* Menu rendered with Portal for proper z-index */}
      <Portal>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={{ x: windowWidth - 16, y: 56 }}
          anchorPosition="bottom"
          contentStyle={styles.menuContent}
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              handleDelete();
            }}
            title="Delete Student"
            leadingIcon="delete"
            titleStyle={{ color: '#d32f2f' }}
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
            {student.parents.map((parent, index) => (
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
                    {format(record.date.toDate(), 'MMM d, yyyy')}
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
                      {format(hw.createdAt.toDate(), 'MMM d, yyyy')}
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
