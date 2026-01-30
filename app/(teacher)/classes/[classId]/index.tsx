import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, FAB, IconButton, Menu } from 'react-native-paper';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { getClass, deleteClass } from '../../../../src/services/class.service';
import { subscribeToStudents } from '../../../../src/services/student.service';
import { LoadingSpinner } from '../../../../src/components/common';
import { Class, Student } from '../../../../src/types';

export default function ClassDetailScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { user } = useAuth();
  const [classData, setClassData] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  useEffect(() => {
    if (!classId) return;

    // Fetch class details
    getClass(classId).then((data) => {
      setClassData(data);
    });

    // Subscribe to students
    const unsubscribe = subscribeToStudents(
      classId,
      (studentList) => {
        setStudents(studentList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching students:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [classId]);

  const handleDeleteClass = () => {
    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class? This will also delete all students and their records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!classId || !user) return;
            try {
              await deleteClass(classId, user.uid);
              router.back();
            } catch (error) {
              console.error('Error deleting class:', error);
              Alert.alert('Error', 'Failed to delete class');
            }
          },
        },
      ]
    );
  };

  const handleStudentPress = (student: Student) => {
    router.push(`/(teacher)/classes/${classId}/students/${student.id}`);
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity onPress={() => handleStudentPress(item)}>
      <Card style={styles.studentCard}>
        <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium" style={styles.studentName}>
            {item.lastName}, {item.firstName}
          </Text>
          <Text variant="bodySmall" style={styles.parentInfo}>
            {item.parents.length} parent{item.parents.length !== 1 ? 's' : ''}
          </Text>
        </Card.Content>
      </Card>
    </TouchableOpacity>
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
              visible={menuVisible}
              onDismiss={closeMenu}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor="#fff"
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
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  handleDeleteClass();
                }}
                title="Delete Class"
                leadingIcon="delete"
                titleStyle={{ color: '#d32f2f' }}
              />
            </Menu>
          ),
        }}
      />

      <View style={styles.container}>
        {classData?.description && (
          <View style={styles.descriptionContainer}>
            <Text variant="bodyMedium" style={styles.description}>
              {classData.description}
            </Text>
          </View>
        )}

        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
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
            <Text variant="bodyMedium" style={styles.emptyMessage}>
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
    backgroundColor: '#f5f5f5',
  },
  descriptionContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  description: {
    color: '#666',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentName: {
    fontWeight: '600',
  },
  parentInfo: {
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyMessage: {
    color: '#666',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#1a73e8',
  },
});
