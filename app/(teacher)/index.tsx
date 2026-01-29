import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import {
  Text,
  Searchbar,
  FAB,
  Card,
  Portal,
  Modal,
  TextInput,
  Button,
  IconButton,
} from 'react-native-paper';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { useClasses } from '../../src/hooks/useClasses';
import { useSelectedClass } from '../../src/hooks/useSelectedClass';
import { ClassDropdown } from '../../src/components/teacher';
import { LoadingSpinner } from '../../src/components/common';
import { Student, AttendanceStatus } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import {
  toggleAttendance,
  getStudentAttendanceForDate,
} from '../../src/services/attendance.service';
import {
  createHomework,
  getHomeworkAssignedToday,
} from '../../src/services/homework.service';

interface TodayAttendance {
  [studentId: string]: AttendanceStatus | null;
}

export default function TeacherHomeScreen() {
  const { user } = useAuth();
  const { classes, loading: classesLoading } = useClasses();
  const { selectedClassId } = useSelectedClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>({});
  const [homeworkModalVisible, setHomeworkModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [submittingHomework, setSubmittingHomework] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  // Fetch students when class changes
  useEffect(() => {
    if (!selectedClassId || !user?.uid) {
      setStudents([]);
      setFilteredStudents([]);
      setTodayAttendance({});
      return;
    }

    setLoading(true);
    const studentsRef = collection(firestore, 'students');
    const q = query(
      studentsRef,
      where('classId', '==', selectedClassId),
      where('teacherId', '==', user.uid),
      orderBy('lastName', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const studentList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Student[];
        setStudents(studentList);
        setFilteredStudents(studentList);
        setLoading(false);

        // Fetch today's attendance for all students
        fetchTodayAttendance(studentList);
      },
      (error) => {
        console.error('Error fetching students:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [selectedClassId, user?.uid]);

  // Fetch today's attendance for all students
  const fetchTodayAttendance = async (studentList: Student[]) => {
    const today = new Date();
    const attendanceMap: TodayAttendance = {};

    await Promise.all(
      studentList.map(async (student) => {
        const attendance = await getStudentAttendanceForDate(student.id, today);
        attendanceMap[student.id] = attendance?.status || null;
      })
    );

    setTodayAttendance(attendanceMap);
  };

  // Filter students based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students);
      return;
    }

    const q = searchQuery.toLowerCase();
    const filtered = students.filter(
      (student) =>
        student.firstName.toLowerCase().includes(q) ||
        student.lastName.toLowerCase().includes(q)
    );
    setFilteredStudents(filtered);
  }, [searchQuery, students]);

  const handleStudentPress = (student: Student) => {
    router.push(
      `/(teacher)/classes/${selectedClassId}/students/${student.id}`
    );
  };

  const handleSwipeRight = async (student: Student) => {
    if (!user?.uid || !selectedClassId) return;

    try {
      const result = await toggleAttendance(
        student.id,
        selectedClassId,
        user.uid,
        new Date()
      );

      setTodayAttendance((prev) => ({
        ...prev,
        [student.id]: result.status,
      }));

      // Close the swipeable
      swipeableRefs.current.get(student.id)?.close();
    } catch (error) {
      console.error('Error toggling attendance:', error);
      Alert.alert('Error', 'Failed to update attendance');
    }
  };

  const handleSwipeLeft = (student: Student) => {
    setSelectedStudent(student);
    setHomeworkTitle('');
    setHomeworkDescription('');
    setHomeworkModalVisible(true);
    // Close the swipeable
    swipeableRefs.current.get(student.id)?.close();
  };

  const handleSubmitHomework = async () => {
    if (!selectedStudent || !user?.uid || !selectedClassId) return;
    if (!homeworkTitle.trim()) {
      Alert.alert('Error', 'Please enter a homework title');
      return;
    }

    setSubmittingHomework(true);
    try {
      // Check if homework already assigned today
      const existingHomework = await getHomeworkAssignedToday(
        selectedStudent.id,
        new Date()
      );

      if (existingHomework.length > 0) {
        Alert.alert(
          'Homework Already Assigned',
          'This student already has homework assigned for today. Do you want to add another?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add Anyway',
              onPress: async () => {
                await createHomework(
                  selectedStudent.id,
                  selectedClassId,
                  user.uid,
                  {
                    title: homeworkTitle.trim(),
                    description: homeworkDescription.trim() || undefined,
                  }
                );
                setHomeworkModalVisible(false);
                Alert.alert('Success', 'Homework assigned successfully');
              },
            },
          ]
        );
        setSubmittingHomework(false);
        return;
      }

      await createHomework(selectedStudent.id, selectedClassId, user.uid, {
        title: homeworkTitle.trim(),
        description: homeworkDescription.trim() || undefined,
      });

      setHomeworkModalVisible(false);
      Alert.alert('Success', 'Homework assigned successfully');
    } catch (error) {
      console.error('Error creating homework:', error);
      Alert.alert('Error', 'Failed to assign homework');
    } finally {
      setSubmittingHomework(false);
    }
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    student: Student
  ) => {
    const status = todayAttendance[student.id];
    const isPresent = status === 'present';
    const isAbsent = status === 'absent';

    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 0],
    });

    return (
      <Animated.View
        style={[
          styles.swipeAction,
          styles.swipeActionRight,
          { transform: [{ translateX: trans }] },
        ]}
      >
        <View style={[styles.swipeContent, { backgroundColor: isPresent ? '#ff5722' : '#4caf50' }]}>
          <Text style={styles.swipeText}>
            {isPresent ? 'Mark Absent' : isAbsent ? 'Mark Present' : 'Mark Present'}
          </Text>
          <IconButton
            icon={isPresent ? 'close' : 'check'}
            iconColor="#fff"
            size={24}
          />
        </View>
      </Animated.View>
    );
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-100, 0],
    });

    return (
      <Animated.View
        style={[
          styles.swipeAction,
          styles.swipeActionLeft,
          { transform: [{ translateX: trans }] },
        ]}
      >
        <View style={[styles.swipeContent, { backgroundColor: '#2196f3' }]}>
          <IconButton icon="book-open-variant" iconColor="#fff" size={24} />
          <Text style={styles.swipeText}>Homework</Text>
        </View>
      </Animated.View>
    );
  };

  const getAttendanceChipStyle = (status: AttendanceStatus | null) => {
    switch (status) {
      case 'present':
        return { backgroundColor: '#e8f5e9', borderColor: '#4caf50' };
      case 'absent':
        return { backgroundColor: '#ffebee', borderColor: '#f44336' };
      case 'late':
        return { backgroundColor: '#fff3e0', borderColor: '#ff9800' };
      case 'excused':
        return { backgroundColor: '#e3f2fd', borderColor: '#2196f3' };
      default:
        return { backgroundColor: '#f5f5f5', borderColor: '#9e9e9e' };
    }
  };

  const getAttendanceLabel = (status: AttendanceStatus | null) => {
    switch (status) {
      case 'present':
        return 'Present';
      case 'absent':
        return 'Absent';
      case 'late':
        return 'Late';
      case 'excused':
        return 'Excused';
      default:
        return 'Not marked';
    }
  };

  const renderStudent = ({ item }: { item: Student }) => {
    const status = todayAttendance[item.id];
    const chipStyle = getAttendanceChipStyle(status);

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress) => renderRightActions(progress, item)}
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            handleSwipeRight(item);
          } else if (direction === 'left') {
            handleSwipeLeft(item);
          }
        }}
        overshootRight={false}
        overshootLeft={false}
      >
        <TouchableOpacity onPress={() => handleStudentPress(item)}>
          <Card style={styles.studentCard}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.studentInfo}>
                <Text variant="titleMedium" style={styles.studentName}>
                  {item.lastName}, {item.firstName}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.attendanceChip, chipStyle]}>
                    <Text style={[styles.attendanceText, { color: chipStyle.borderColor }]}>
                      {getAttendanceLabel(status)}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={styles.swipeHint}>← Homework | Attendance →</Text>
            </Card.Content>
          </Card>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  if (classesLoading) {
    return <LoadingSpinner message="Loading classes..." />;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ClassDropdown />

      {selectedClassId ? (
        <>
          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Search students..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchbar}
            />
          </View>

          {loading ? (
            <LoadingSpinner message="Loading students..." />
          ) : filteredStudents.length > 0 ? (
            <FlatList
              data={filteredStudents}
              renderItem={renderStudent}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
          ) : students.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No students yet
              </Text>
              <Text variant="bodyMedium" style={styles.emptyMessage}>
                Add students to this class to get started
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text variant="bodyMedium" style={styles.emptyMessage}>
                No students match your search
              </Text>
            </View>
          )}

          <FAB
            icon="plus"
            style={styles.fab}
            onPress={() =>
              router.push(`/(teacher)/classes/${selectedClassId}/students/add`)
            }
          />
        </>
      ) : classes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            Welcome, {user?.firstName}!
          </Text>
          <Text variant="bodyMedium" style={styles.emptyMessage}>
            Create your first class to get started
          </Text>
          <FAB
            icon="plus"
            label="Create Class"
            style={styles.createClassFab}
            onPress={() => router.push('/(teacher)/classes/create')}
          />
        </View>
      ) : null}

      {/* Homework Modal */}
      <Portal>
        <Modal
          visible={homeworkModalVisible}
          onDismiss={() => setHomeworkModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            Assign Homework
          </Text>
          {selectedStudent && (
            <Text variant="bodyMedium" style={styles.modalSubtitle}>
              For: {selectedStudent.firstName} {selectedStudent.lastName}
            </Text>
          )}

          <TextInput
            label="Title *"
            value={homeworkTitle}
            onChangeText={setHomeworkTitle}
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Description (optional)"
            value={homeworkDescription}
            onChangeText={setHomeworkDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
          />

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => setHomeworkModalVisible(false)}
              style={styles.modalButton}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmitHomework}
              loading={submittingHomework}
              disabled={submittingHomework || !homeworkTitle.trim()}
              style={styles.modalButton}
            >
              Assign
            </Button>
          </View>
        </Modal>
      </Portal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  searchbar: {
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  studentCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardContent: {
    flexDirection: 'column',
    gap: 8,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  attendanceChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  attendanceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  swipeHint: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
  swipeAction: {
    justifyContent: 'center',
    marginBottom: 12,
  },
  swipeActionRight: {
    alignItems: 'flex-end',
  },
  swipeActionLeft: {
    alignItems: 'flex-start',
  },
  swipeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
  },
  swipeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyMessage: {
    color: '#666',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1a73e8',
  },
  createClassFab: {
    marginTop: 24,
    backgroundColor: '#1a73e8',
  },
  modalContainer: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 24,
    zIndex: 1000,
  },
  modalTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#666',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    minWidth: 100,
  },
});
