import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { Text, Searchbar, FAB, Card, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { useClasses } from '../../src/hooks/useClasses';
import { useSelectedClass } from '../../src/hooks/useSelectedClass';
import { ClassDropdown } from '../../src/components/teacher';
import { LoadingSpinner } from '../../src/components/common';
import { Student } from '../../src/types';
import firestore from '@react-native-firebase/firestore';

export default function TeacherHomeScreen() {
  const { user } = useAuth();
  const { classes, loading: classesLoading } = useClasses();
  const { selectedClassId } = useSelectedClass();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch students when class changes
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setFilteredStudents([]);
      return;
    }

    setLoading(true);
    const unsubscribe = firestore()
      .collection('students')
      .where('classId', '==', selectedClassId)
      .orderBy('lastName', 'asc')
      .onSnapshot(
        (snapshot) => {
          const studentList = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Student[];
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
  }, [selectedClassId]);

  // Filter students based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = students.filter(
      (student) =>
        student.firstName.toLowerCase().includes(query) ||
        student.lastName.toLowerCase().includes(query)
    );
    setFilteredStudents(filtered);
  }, [searchQuery, students]);

  const handleStudentPress = (student: Student) => {
    router.push(
      `/(teacher)/classes/${selectedClassId}/students/${student.id}`
    );
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity onPress={() => handleStudentPress(item)}>
      <Card style={styles.studentCard}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.studentInfo}>
            <Text variant="titleMedium" style={styles.studentName}>
              {item.lastName}, {item.firstName}
            </Text>
            <Text variant="bodySmall" style={styles.parentCount}>
              {item.parents.length} parent{item.parents.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.actions}>
            <Chip
              compact
              mode="outlined"
              onPress={() =>
                router.push(
                  `/(teacher)/classes/${selectedClassId}/students/${item.id}/attendance/add`
                )
              }
            >
              Attendance
            </Chip>
            <Chip
              compact
              mode="outlined"
              onPress={() =>
                router.push(
                  `/(teacher)/classes/${selectedClassId}/students/${item.id}/homework/add`
                )
              }
            >
              Homework
            </Chip>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  if (classesLoading) {
    return <LoadingSpinner message="Loading classes..." />;
  }

  return (
    <View style={styles.container}>
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
    </View>
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
    gap: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontWeight: '600',
  },
  parentCount: {
    color: '#666',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
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
