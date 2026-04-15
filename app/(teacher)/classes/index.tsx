import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Animated,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  Modal as RNModal,
  Dimensions,
} from 'react-native';
import {
  Text,
  Card,
  FAB,
  IconButton,
  Menu,
  Searchbar,
  Portal,
  Modal,
  TextInput,
  Button,
} from 'react-native-paper';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { router, Stack } from 'expo-router';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useClasses } from '../../../src/hooks/useClasses';
import { useSelectedClass } from '../../../src/hooks/useSelectedClass';
import { ClassDropdown } from '../../../src/components/teacher';
import { LoadingSpinner, AppSnackbar } from '../../../src/components/common';
import { Student, AttendanceStatus, Homework, HomeworkStatus, HomeworkEvaluation } from '../../../src/types';
import { firestore } from '../../../src/config/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import {
  toggleAttendance,
} from '../../../src/services/attendance.service';
import {
  createHomework,
  getHomeworkAssignedToday,
  getRecentPendingHomeworkAsTeacher,
  updateHomework,
} from '../../../src/services/homework.service';
import { getInvitedTeacherIds, updateStudentSurahAyahMode } from '../../../src/services/student.service';
import { SurahAyahInput, SurahAyahSelection } from '../../../src/components/homework/SurahAyahInput';
import { format } from 'date-fns';

interface TodayAttendance {
  [studentId: string]: AttendanceStatus | null;
}

export default function ClassesScreen() {
  const { user, checkForNewAdminInvites } = useAuth();
  const { classes, loading: classesLoading } = useClasses();
  const [refreshing, setRefreshing] = useState(false);
  const { selectedClassId, clearSelection } = useSelectedClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuActionRef = useRef(0);

  // Attendance state
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>({});

  // Homework modal state
  const [homeworkModalVisible, setHomeworkModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState('');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [submittingHomework, setSubmittingHomework] = useState(false);

  // Quran mode state for homework modal
  const [hwQuranMode, setHwQuranMode] = useState(false);
  const [hwMenuVisible, setHwMenuVisible] = useState(false);
  const [hwMenuPosition, setHwMenuPosition] = useState({ top: 0, right: 0 });
  const hwMenuAnchorRef = useRef<View>(null);
  const [surahAyah, setSurahAyah] = useState<SurahAyahSelection>({
    fromSurah: null, fromAyah: null, toSurah: null, toAyah: null,
  });

  // Evaluate modal state
  const [evaluateModalVisible, setEvaluateModalVisible] = useState(false);
  const [pendingHomework, setPendingHomework] = useState<Homework[]>([]);
  const [loadingPendingHomework, setLoadingPendingHomework] = useState(false);
  const [updatingHomeworkId, setUpdatingHomeworkId] = useState<string | null>(null);
  const [selectedEvaluations, setSelectedEvaluations] = useState<Record<string, HomeworkEvaluation | null>>({});
  const [homeworkComments, setHomeworkComments] = useState<Record<string, string>>({});

  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await checkForNewAdminInvites();
    } finally {
      setRefreshing(false);
    }
  }, [checkForNewAdminInvites]);


  // Snackbar state
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Menu handlers
  const MENU_DEBOUNCE_MS = 300;

  const openMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastMenuActionRef.current < MENU_DEBOUNCE_MS) return;
    lastMenuActionRef.current = now;
    setMenuKey((k) => k + 1);
    setMenuVisible(true);
  }, []);

  const closeMenu = useCallback(() => {
    lastMenuActionRef.current = Date.now();
    setMenuVisible(false);
  }, []);

  // Clear selected class if it was deleted
  useEffect(() => {
    if (!classesLoading && selectedClassId && !classes.find((c) => c.id === selectedClassId)) {
      clearSelection();
    }
  }, [classes, classesLoading, selectedClassId, clearSelection]);

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
    const selectedClass = classes.find((c) => c.id === selectedClassId);
    const isOwner = selectedClass?.teacherId === user?.uid;
    const q = isOwner
      ? query(
          studentsRef,
          where('classId', '==', selectedClassId),
          where('teacherId', '==', user?.uid)
        )
      : query(
          studentsRef,
          where('classId', '==', selectedClassId),
          where('invitedTeacherIds', 'array-contains', user?.uid)
        );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const studentList = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Student))
          .sort((a, b) => a.lastName.localeCompare(b.lastName));
        setStudents(studentList);
        setFilteredStudents(studentList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching students:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [selectedClassId, user?.uid, classes]);

  // Real-time listener for today's attendance
  useEffect(() => {
    if (!selectedClassId || !user?.uid) {
      setTodayAttendance({});
      return;
    }

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRef = collection(firestore, 'attendance');

    const q = query(
      attendanceRef,
      where('classId', '==', selectedClassId),
      where('invitedTeacherIds', 'array-contains', user?.uid),
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<=', Timestamp.fromDate(endOfDay))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const attendanceMap: TodayAttendance = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          attendanceMap[data.studentId] = data.status || null;
        });
        setTodayAttendance(attendanceMap);
      },
      (error) => {
        console.error('Error listening to attendance:', error);
      }
    );

    return unsubscribe;
  }, [selectedClassId, user?.uid, classes]);

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
    router.navigate(`/(teacher)/classes/${selectedClassId}/students/${student.id}`);
  };

  // Swipe right: toggle attendance
  const handleSwipeRight = async (student: Student) => {
    if (!user?.uid || !selectedClassId) return;

    try {
      const freshTeacherIds = await getInvitedTeacherIds(selectedClassId);
      const result = await toggleAttendance(
        student.id,
        selectedClassId,
        user.uid,
        new Date(),
        student.parentUserIds || [],
        freshTeacherIds
      );

      setTodayAttendance((prev) => ({
        ...prev,
        [student.id]: result.status,
      }));

      setSnackbarMessage(`${student.firstName} marked as ${result.status}`);
      swipeableRefs.current.get(student.id)?.close();
    } catch (error) {
      console.error('Error toggling attendance:', error);
      Alert.alert('Error', 'Failed to update attendance');
    }
  };

  // Swipe left: homework actions
  const openHwMenu = useCallback(() => {
    hwMenuAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setHwMenuPosition({ top: y + height, right: Dimensions.get('window').width - x - width });
      setHwMenuVisible(true);
    });
  }, []);

  const closeHwMenu = useCallback(() => {
    setHwMenuVisible(false);
  }, []);

  const toggleHwQuranMode = async () => {
    closeHwMenu();
    const newMode = !hwQuranMode;
    setHwQuranMode(newMode);
    if (selectedStudent) {
      try {
        await updateStudentSurahAyahMode(selectedStudent.id, newMode);
      } catch (err) {
        console.error('Failed to update Quran mode:', err);
      }
    }
    if (newMode) {
      setSurahAyah({ fromSurah: null, fromAyah: null, toSurah: null, toAyah: null });
    }
  };

  const handleOpenNewHomework = (student: Student) => {
    setSelectedStudent(student);
    setHomeworkTitle('');
    setHomeworkDescription('');
    setHwQuranMode(!!student.surahAyahMode);
    setSurahAyah({ fromSurah: null, fromAyah: null, toSurah: null, toAyah: null });
    setHomeworkModalVisible(true);
    swipeableRefs.current.get(student.id)?.close();
  };

  const handleOpenEvaluate = async (student: Student) => {
    setSelectedStudent(student);
    setLoadingPendingHomework(true);
    setEvaluateModalVisible(true);
    swipeableRefs.current.get(student.id)?.close();

    try {
      const homework = await getRecentPendingHomeworkAsTeacher(student.id, user!.uid, 3);
      setPendingHomework(homework);
    } catch (error) {
      console.error('Error fetching pending homework:', error);
      Alert.alert('Error', 'Failed to load homework');
    } finally {
      setLoadingPendingHomework(false);
    }
  };

  const handleQuickStatusUpdate = async (homeworkId: string, status: HomeworkStatus) => {
    const evaluation = selectedEvaluations[homeworkId];
    if (!evaluation) {
      Alert.alert('Rating Required', 'Please select a star rating before marking the homework.');
      return;
    }

    setUpdatingHomeworkId(homeworkId);
    try {
      const comment = homeworkComments[homeworkId]?.trim();
      const updateData: { status: HomeworkStatus; evaluation: HomeworkEvaluation; notes?: string } = {
        status,
        evaluation,
      };
      if (comment) {
        updateData.notes = comment;
      }
      await updateHomework(homeworkId, updateData);
      setSnackbarMessage(`Homework marked as ${status}`);
      setPendingHomework((prev) => prev.filter((h) => h.id !== homeworkId));
      setSelectedEvaluations((prev) => {
        const updated = { ...prev };
        delete updated[homeworkId];
        return updated;
      });
      setHomeworkComments((prev) => {
        const updated = { ...prev };
        delete updated[homeworkId];
        return updated;
      });
      if (selectedStudent && pendingHomework.length > 1) {
        const moreHomework = await getRecentPendingHomeworkAsTeacher(selectedStudent.id, user!.uid, 3);
        setPendingHomework(moreHomework.filter((h) => h.id !== homeworkId));
      }
    } catch (error) {
      console.error('Error updating homework:', error);
      Alert.alert('Error', 'Failed to update homework');
    } finally {
      setUpdatingHomeworkId(null);
    }
  };

  const handleStarPress = (homeworkId: string, rating: HomeworkEvaluation) => {
    setSelectedEvaluations((prev) => ({
      ...prev,
      [homeworkId]: prev[homeworkId] === rating ? null : rating,
    }));
  };

  const renderStars = (homeworkId: string) => {
    const currentRating = selectedEvaluations[homeworkId] || 0;
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleStarPress(homeworkId, star as HomeworkEvaluation)}
            style={styles.starButton}
          >
            <IconButton
              icon={star <= currentRating ? 'star' : 'star-outline'}
              iconColor={star <= currentRating ? '#ffc107' : '#ccc'}
              size={28}
              style={{ margin: 0 }}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const handleSubmitHomework = async () => {
    if (!selectedStudent || !user?.uid || !selectedClassId) return;
    if (!homeworkTitle.trim()) {
      Alert.alert('Error', 'Please enter a homework title');
      return;
    }

    setSubmittingHomework(true);
    try {
      const existingHomework = await getHomeworkAssignedToday(
        selectedStudent.id,
        user.uid,
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
                const freshIds = await getInvitedTeacherIds(selectedClassId);
                await createHomework(
                  selectedStudent.id,
                  selectedClassId,
                  user.uid,
                  {
                    title: homeworkTitle.trim(),
                    description: homeworkDescription.trim() || undefined,
                  },
                  selectedStudent.parentUserIds || [],
                  freshIds
                );
                setHomeworkModalVisible(false);
                setSnackbarMessage('Homework assigned successfully');
              },
            },
          ]
        );
        setSubmittingHomework(false);
        return;
      }

      const freshTeacherIds = await getInvitedTeacherIds(selectedClassId);
      await createHomework(selectedStudent.id, selectedClassId, user.uid, {
        title: homeworkTitle.trim(),
        description: homeworkDescription.trim() || undefined,
      }, selectedStudent.parentUserIds || [], freshTeacherIds);

      setHomeworkModalVisible(false);
      setSnackbarMessage('Homework assigned successfully');
    } catch (error) {
      console.error('Error creating homework:', error);
      Alert.alert('Error', 'Failed to assign homework');
    } finally {
      setSubmittingHomework(false);
    }
  };

  // Swipe action renderers
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
    progress: Animated.AnimatedInterpolation<number>,
    student: Student
  ) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-160, 0],
    });

    return (
      <Animated.View
        style={[
          styles.swipeAction,
          styles.swipeActionLeft,
          { transform: [{ translateX: trans }] },
        ]}
      >
        <View style={styles.swipeActionsRow}>
          <TouchableOpacity
            style={[styles.swipeActionButton, { backgroundColor: '#2196f3' }]}
            onPress={() => handleOpenNewHomework(student)}
          >
            <IconButton icon="plus" iconColor="#fff" size={20} style={{ margin: 0 }} />
            <Text style={styles.swipeButtonText}>New</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.swipeActionButton, { backgroundColor: '#ff9800' }]}
            onPress={() => handleOpenEvaluate(student)}
          >
            <IconButton icon="clipboard-check" iconColor="#fff" size={20} style={{ margin: 0 }} />
            <Text style={styles.swipeButtonText}>Evaluate</Text>
          </TouchableOpacity>
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
        renderLeftActions={(progress) => renderLeftActions(progress, item)}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            handleSwipeRight(item);
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
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="refresh"
              iconColor="#fff"
              size={24}
              onPress={handleRefresh}
              disabled={refreshing}
              style={{ margin: 0 }}
            />
          ),
        }}
      />
      {/* Class dropdown with menu */}
      <View style={styles.headerRow}>
        <View style={styles.dropdownContainer}>
          <ClassDropdown />
        </View>
        {selectedClassId && (
          <Menu
            key={menuKey}
            visible={menuVisible}
            onDismiss={closeMenu}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={24}
                onPress={openMenu}
                style={styles.menuButton}
              />
            }
          >
            <Menu.Item
              onPress={() => {
                closeMenu();
                router.push(`/(teacher)/classes/${selectedClassId}/edit`);
              }}
              title="Edit Class"
              leadingIcon="pencil"
            />
            <Menu.Item
              onPress={() => {
                closeMenu();
                router.push(`/(teacher)/classes/${selectedClassId}/reports`);
              }}
              title="Reports"
              leadingIcon="file-document"
            />
          </Menu>
        )}
      </View>

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

          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Students ({filteredStudents.length})
            </Text>
          </View>

          {loading ? (
            <LoadingSpinner message="Loading students..." />
          ) : filteredStudents.length > 0 ? (
            <FlatList
              data={filteredStudents}
              renderItem={renderStudent}
              keyExtractor={(item) => item.id}
              extraData={todayAttendance}
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
            Create your first class to get started, or if you are waiting to be invited to a class, please reach out to the other teacher.
          </Text>
          <FAB
            icon="plus"
            label="Create Class"
            style={styles.createClassFab}
            onPress={() => router.push('/(teacher)/classes/create')}
          />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text variant="titleMedium" style={styles.emptyTitle}>
            Select a class
          </Text>
          <Text variant="bodyMedium" style={styles.emptyMessage}>
            Use the dropdown above to select a class
          </Text>
        </View>
      )}

      {/* Homework Modal */}
      <Portal>
        <Modal
          visible={homeworkModalVisible}
          onDismiss={Keyboard.dismiss}
          dismissable={true}
          contentContainerStyle={styles.modalContainer}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalTitleContent}>
                  <Text variant="titleLarge" style={styles.modalTitle}>
                    Assign Homework
                  </Text>
                  {selectedStudent && (
                    <Text variant="bodyMedium" style={styles.modalSubtitle}>
                      For: {selectedStudent.firstName} {selectedStudent.lastName}
                    </Text>
                  )}
                </View>
                <View ref={hwMenuAnchorRef}>
                  <IconButton
                    icon="dots-vertical"
                    size={24}
                    onPress={openHwMenu}
                  />
                </View>
              </View>

              {hwQuranMode ? (
                <SurahAyahInput
                  value={surahAyah}
                  onChange={setSurahAyah}
                  onTitleChange={setHomeworkTitle}
                />
              ) : (
                <TextInput
                  label="Title *"
                  value={homeworkTitle}
                  onChangeText={setHomeworkTitle}
                  mode="outlined"
                  style={styles.input}
                  returnKeyType="done"
                />
              )}

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
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </Portal>

      {/* Quran Mode menu for homework modal */}
      <RNModal
        visible={hwMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeHwMenu}
      >
        <TouchableWithoutFeedback onPress={closeHwMenu}>
          <View style={styles.hwMenuBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.hwMenuContent, { position: 'absolute', top: hwMenuPosition.top, right: hwMenuPosition.right }]}>
                <TouchableOpacity style={styles.hwMenuItem} onPress={toggleHwQuranMode}>
                  {hwQuranMode && (
                    <IconButton icon="check" size={20} style={styles.hwMenuIcon} />
                  )}
                  <Text variant="bodyLarge" style={[styles.hwMenuText, !hwQuranMode && styles.hwMenuTextNoIcon]}>
                    Quran Mode
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      {/* Evaluate Homework Modal */}
      <Portal>
        <Modal
          visible={evaluateModalVisible}
          onDismiss={() => setEvaluateModalVisible(false)}
          dismissable={true}
          contentContainerStyle={styles.modalContainer}
        >
          <View>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Evaluate Homework
            </Text>
            {selectedStudent && (
              <Text variant="bodyMedium" style={styles.modalSubtitle}>
                {selectedStudent.firstName} {selectedStudent.lastName}
              </Text>
            )}

            {loadingPendingHomework ? (
              <View style={styles.evaluateLoading}>
                <Text variant="bodyMedium" style={styles.loadingText}>Loading...</Text>
              </View>
            ) : pendingHomework.length === 0 ? (
              <View style={styles.evaluateEmpty}>
                <Text variant="bodyMedium" style={styles.emptyText}>
                  No pending homework to evaluate
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.homeworkScrollView} showsVerticalScrollIndicator={true}>
                <View style={styles.homeworkList}>
                {pendingHomework.map((hw) => (
                  <Card key={hw.id} style={styles.homeworkCard}>
                    <Card.Content style={styles.homeworkCardContent}>
                      <View style={styles.homeworkHeader}>
                        <Text variant="titleMedium" style={styles.homeworkTitleText}>
                          {hw.title}
                        </Text>
                        <Text variant="bodySmall" style={styles.homeworkDate}>
                          {hw.createdAt ? format(hw.createdAt.toDate(), 'MMM d') : 'Today'}
                        </Text>
                      </View>

                      {renderStars(hw.id)}

                      <TextInput
                        placeholder="Comment (optional)"
                        value={homeworkComments[hw.id] || ''}
                        onChangeText={(text) =>
                          setHomeworkComments((prev) => ({ ...prev, [hw.id]: text }))
                        }
                        mode="outlined"
                        dense
                        style={styles.commentInput}
                      />

                      <View style={styles.statusButtons}>
                        <TouchableOpacity
                          style={[styles.statusButton, styles.statusComplete, updatingHomeworkId === hw.id && styles.statusButtonDisabled]}
                          onPress={() => handleQuickStatusUpdate(hw.id, 'completed')}
                          disabled={updatingHomeworkId === hw.id}
                        >
                          <IconButton
                            icon="check"
                            iconColor="#fff"
                            size={24}
                            style={{ margin: 0 }}
                          />
                          <Text style={styles.statusButtonText}>Complete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.statusButton, styles.statusLate, updatingHomeworkId === hw.id && styles.statusButtonDisabled]}
                          onPress={() => handleQuickStatusUpdate(hw.id, 'late')}
                          disabled={updatingHomeworkId === hw.id}
                        >
                          <IconButton
                            icon="clock-outline"
                            iconColor="#fff"
                            size={24}
                            style={{ margin: 0 }}
                          />
                          <Text style={styles.statusButtonText}>Late</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.statusButton, styles.statusIncomplete, updatingHomeworkId === hw.id && styles.statusButtonDisabled]}
                          onPress={() => handleQuickStatusUpdate(hw.id, 'incomplete')}
                          disabled={updatingHomeworkId === hw.id}
                        >
                          <IconButton
                            icon="close"
                            iconColor="#fff"
                            size={24}
                            style={{ margin: 0 }}
                          />
                          <Text style={styles.statusButtonText}>Incomplete</Text>
                        </TouchableOpacity>
                      </View>
                    </Card.Content>
                  </Card>
                ))}
                </View>
              </ScrollView>
            )}

            <Button
              mode="outlined"
              onPress={() => setEvaluateModalVisible(false)}
              style={styles.closeButton}
            >
              Close
            </Button>
          </View>
        </Modal>
      </Portal>
      <AppSnackbar
        type="success"
        message={snackbarMessage}
        onDismiss={() => setSnackbarMessage(null)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    zIndex: 1000,
  },
  dropdownContainer: {
    flex: 1,
  },
  menuButton: {
    marginRight: 4,
    marginLeft: -8,
  },
  searchContainer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  searchbar: {
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
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
  swipeActionsRow: {
    flexDirection: 'row',
    height: '100%',
    gap: 4,
  },
  swipeActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 70,
  },
  swipeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 11,
    marginTop: -4,
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
  modalTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  modalTitleContent: {
    flex: 1,
  },
  modalTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#666',
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
  evaluateLoading: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
  },
  evaluateEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  homeworkScrollView: {
    maxHeight: 350,
    marginTop: 8,
  },
  homeworkList: {
    gap: 12,
  },
  homeworkCard: {
    backgroundColor: '#f9f9f9',
  },
  homeworkCardContent: {
    flexDirection: 'column',
    paddingVertical: 12,
    gap: 12,
  },
  homeworkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeworkTitleText: {
    fontWeight: '600',
    flex: 1,
  },
  homeworkDate: {
    color: '#666',
    marginLeft: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  starButton: {
    padding: 0,
  },
  commentInput: {
    backgroundColor: '#fff',
    fontSize: 14,
  },
  statusButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  statusButtonDisabled: {
    opacity: 0.5,
  },
  statusButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    marginTop: -4,
  },
  statusComplete: {
    backgroundColor: '#4caf50',
  },
  statusLate: {
    backgroundColor: '#ff9800',
  },
  statusIncomplete: {
    backgroundColor: '#f44336',
  },
  closeButton: {
    marginTop: 16,
  },
  hwMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  hwMenuContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 180,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  hwMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hwMenuIcon: {
    margin: 0,
    marginRight: 4,
  },
  hwMenuText: {
    fontSize: 16,
  },
  hwMenuTextNoIcon: {
    paddingLeft: 8,
  },
});
