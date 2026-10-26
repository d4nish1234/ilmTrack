import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Text,
  Card,
  FAB,
  IconButton,
  Menu,
  Searchbar,
} from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { router, Stack } from 'expo-router';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useClasses } from '../../../src/hooks/useClasses';
import { useSelectedClass } from '../../../src/hooks/useSelectedClass';
import { ClassDropdown } from '../../../src/components/teacher';
import { TimeClockBar } from '../../../src/components/timeclock/TimeClockBar';
import { useTimeClock } from '../../../src/contexts/TimeClockContext';
import { LoadingSpinner, AppSnackbar } from '../../../src/components/common';
import { Student, AttendanceStatus } from '../../../src/types';
import { firestore } from '../../../src/config/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import {
  toggleAttendance,
} from '../../../src/services/attendance.service';
import { getInvitedTeacherIds } from '../../../src/services/student.service';

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


  const swipeableRefs = useRef<Map<string, SwipeableMethods | null>>(new Map());

  const { refresh: refreshTimeClock } = useTimeClock();
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // The time clock too: a class just added to an organization, or
      // timekeeping just turned on, shows up without reopening the app.
      await Promise.all([checkForNewAdminInvites(), refreshTimeClock()]);
    } finally {
      setRefreshing(false);
    }
  }, [checkForNewAdminInvites, refreshTimeClock]);


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
  const handleOpenNewHomework = (student: Student) => {
    swipeableRefs.current.get(student.id)?.close();
    if (!selectedClassId) return;
    router.push({
      pathname: '/(teacher)/classes/add-homework',
      params: { classId: selectedClassId, studentId: student.id },
    });
  };

  const handleOpenEvaluate = (student: Student) => {
    swipeableRefs.current.get(student.id)?.close();
    router.push({
      pathname: '/(teacher)/classes/evaluate-homework',
      params: { studentId: student.id },
    });
  };

  // Swipe action renderers
  const renderRightActions = (progress: SharedValue<number>, student: Student) => {
    const status = todayAttendance[student.id];
    const isPresent = status === 'present';
    const isAbsent = status === 'absent';

    return (
      <SwipeActionPanel
        progress={progress}
        hiddenOffset={100}
        style={[styles.swipeAction, styles.swipeActionRight]}
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
      </SwipeActionPanel>
    );
  };

  const renderLeftActions = (progress: SharedValue<number>, student: Student) => {
    return (
      <SwipeActionPanel
        progress={progress}
        hiddenOffset={-160}
        style={[styles.swipeAction, styles.swipeActionLeft]}
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
      </SwipeActionPanel>
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
      <ReanimatedSwipeable
        ref={(ref) => {
          swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress) => renderRightActions(progress, item)}
        renderLeftActions={(progress) => renderLeftActions(progress, item)}
        onSwipeableOpen={(direction) => {
          // ReanimatedSwipeable names the direction of the swipe, the legacy
          // Swipeable named the panel. Swiping LEFT opens the right-hand
          // (attendance) panel — this was `direction === 'right'` before.
          if (direction === SwipeDirection.LEFT) {
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
      </ReanimatedSwipeable>
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

      {/* Shown for the selected class's organization when it has timekeeping
          on, or while a shift is open (see timeClockScope). */}
      <TimeClockBar />

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

      <AppSnackbar
        type="success"
        message={snackbarMessage}
        onDismiss={() => setSnackbarMessage(null)}
      />
    </GestureHandlerRootView>
  );
}

/**
 * A swipe action panel that slides in from `hiddenOffset` as the row opens.
 * A component rather than inline styles because the animation now runs on
 * Reanimated shared values, which need the useAnimatedStyle hook.
 *
 * ReanimatedSwipeable keeps both panels behind the row at all times (the
 * legacy Swipeable moved them off-screen), so a closed panel is hidden
 * outright. Otherwise it shows through the card's rounded corners, and
 * through the card itself while TouchableOpacity dims it on press.
 */
function SwipeActionPanel({
  progress,
  hiddenOffset,
  style,
  children,
}: {
  progress: SharedValue<number>;
  hiddenOffset: number;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const slide = useAnimatedStyle(() => ({
    opacity: progress.value > 0 ? 1 : 0,
    transform: [{ translateX: interpolate(progress.value, [0, 1], [hiddenOffset, 0]) }],
  }));
  return <Reanimated.View style={[style, slide]}>{children}</Reanimated.View>;
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
});
