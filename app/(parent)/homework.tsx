import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';
import { useAuth } from '../../src/contexts/AuthContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Homework } from '../../src/types';
import firestore from '@react-native-firebase/firestore';
import { format } from 'date-fns';

export default function ParentHomeworkScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.studentIds?.length) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch students
        const studentDocs = await Promise.all(
          user.studentIds!.map((id) =>
            firestore().collection('students').doc(id).get()
          )
        );

        const studentList = studentDocs
          .filter((doc) => doc.exists)
          .map((doc) => ({ id: doc.id, ...doc.data() })) as Student[];

        setStudents(studentList);

        // Subscribe to homework
        if (studentList.length > 0) {
          const studentIds = studentList.map((s) => s.id);

          const unsubscribe = firestore()
            .collection('homework')
            .where('studentId', 'in', studentIds)
            .orderBy('createdAt', 'desc')
            .onSnapshot(
              (snapshot) => {
                setHomework(
                  snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  })) as Homework[]
                );
                setLoading(false);
              },
              (error) => {
                console.error('Error fetching homework:', error);
                setLoading(false);
              }
            );

          return unsubscribe;
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#4caf50';
      case 'incomplete':
        return '#f44336';
      case 'late':
        return '#ff9800';
      default:
        return '#2196f3';
    }
  };

  const renderHomework = ({ item }: { item: Homework }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text variant="titleMedium" style={styles.title}>
              {item.title}
            </Text>
            <Text variant="bodySmall" style={styles.studentName}>
              {getStudentName(item.studentId)}
            </Text>
            <Text variant="bodySmall" style={styles.date}>
              {format(item.createdAt.toDate(), 'MMM d, yyyy')}
            </Text>
          </View>
          <Chip
            compact
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: '#fff' }}
          >
            {item.status}
          </Chip>
        </View>

        {item.description && (
          <Text variant="bodyMedium" style={styles.description}>
            {item.description}
          </Text>
        )}

        {item.dueDate && (
          <Text variant="bodySmall" style={styles.dueDate}>
            Due: {format(item.dueDate.toDate(), 'MMM d, yyyy')}
          </Text>
        )}

        {item.notes && (
          <Text variant="bodySmall" style={styles.notes}>
            Note: {item.notes}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading homework..." />;
  }

  if (!user?.studentIds?.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodyMedium" style={styles.emptyText}>
          No students linked to your account yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {homework.length > 0 ? (
        <FlatList
          data={homework}
          renderItem={renderHomework}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No homework assigned yet.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: '600',
  },
  studentName: {
    color: '#1a73e8',
    marginTop: 2,
  },
  date: {
    color: '#666',
    marginTop: 2,
  },
  description: {
    marginTop: 12,
    color: '#444',
  },
  dueDate: {
    marginTop: 8,
    color: '#666',
  },
  notes: {
    marginTop: 8,
    color: '#666',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
});
