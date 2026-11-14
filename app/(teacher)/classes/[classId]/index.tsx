import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, FAB, IconButton, Menu } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { getClass } from '../../../../src/services/class.service';
import { subscribeToStudents, subscribeToStudentsAsAdmin } from '../../../../src/services/student.service';
import { LoadingSpinner, Tappable } from '../../../../src/components/common';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { Class, Student } from '../../../../src/types';
import { colors, fontWeight, spacing, typography } from '../../../../src/constants/theme';

export default function ClassDetailScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [classData, setClassData] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuKey, setMenuKey] = useState(0);
  const lastMenuActionRef = useRef(0);

  // Menu handlers - increment key on open to force fresh Menu state
  const MENU_DEBOUNCE_MS = 300;

  const openMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastMenuActionRef.current < MENU_DEBOUNCE_MS) {
      return;
    }
    lastMenuActionRef.current = now;
    setMenuKey((k) => k + 1);
    setMenuVisible(true);
  }, []);

  const closeMenu = useCallback(() => {
    lastMenuActionRef.current = Date.now();
    setMenuVisible(false);
  }, []);

  useEffect(() => {
    if (!classId || !user?.uid) return;

    // Fetch class details, then subscribe to students with the right query
    getClass(classId).then((data) => {
      setClassData(data);
    });

    // Determine if user is class owner or invited teacher
    // We need the class data to decide, so fetch it first
    let unsubscribe: (() => void) | undefined;

    getClass(classId).then((data) => {
      if (!data) {
        setLoading(false);
        return;
      }

      const isOwner = data.teacherId === user.uid;
      const subscribeFn = isOwner ? subscribeToStudents : subscribeToStudentsAsAdmin;

      unsubscribe = subscribeFn(
        classId,
        user.uid,
        (studentList) => {
          setStudents(studentList);
          setLoading(false);
        },
        (error) => {
          console.error('Error fetching students:', error);
          setLoading(false);
        }
      );
    });

    return () => unsubscribe?.();
  }, [classId, user?.uid]);

  const handleStudentPress = (student: Student) => {
    router.push(`/(teacher)/classes/${classId}/students/${student.id}`);
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <Tappable onPress={() => handleStudentPress(item)}>
      <Card style={styles.studentCard}>
        <Card.Content style={styles.cardContent}>
          <Text variant={typography.h4} style={styles.studentName}>
            {item.lastName}, {item.firstName}
          </Text>
          <Text variant={typography.caption} style={styles.parentInfo}>
            {item.parents.length} parent{item.parents.length !== 1 ? 's' : ''}
          </Text>
        </Card.Content>
      </Card>
    </Tappable>
  );

  if (loading) {
    return <LoadingSpinner message="Loading class..." />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: classData?.name || 'Class',
          headerRight: () => (
            <Menu
              key={menuKey}
              visible={menuVisible}
              onDismiss={closeMenu}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor={colors.onPrimary}
                  size={24}
                  style={{ margin: 0 }}
                  onPress={openMenu}
                />
              }
            >
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  router.push(`/(teacher)/classes/${classId}/edit`);
                }}
                title="Edit Class"
                leadingIcon="pencil"
              />
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  router.push(`/(teacher)/classes/${classId}/reports`);
                }}
                title="Reports"
                leadingIcon="file-document"
              />
            </Menu>
          ),
        }}
      />

      <View style={styles.container}>
        {classData?.description && (
          <View style={styles.descriptionContainer}>
            <Text variant={typography.body} style={styles.description}>
              {classData.description}
            </Text>
          </View>
        )}

        <View style={styles.header}>
          <Text variant={typography.h4} style={styles.sectionTitle}>
            Students ({students.length})
          </Text>
        </View>

        {students.length > 0 ? (
          <FlatList
            data={students}
            renderItem={renderStudent}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text variant={typography.body} style={styles.emptyMessage}>
              No students in this class yet
            </Text>
          </View>
        )}

        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push(`/(teacher)/classes/${classId}/students/add`)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  descriptionContainer: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  description: {
    color: colors.textSecondary,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontWeight: fontWeight.semibold,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 80,
  },
  studentCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentName: {
    fontWeight: fontWeight.semibold,
  },
  parentInfo: {
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyMessage: {
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
});
