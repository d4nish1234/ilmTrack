import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';
import { useAuth } from '../../src/contexts/AuthContext';
import { LoadingSpinner } from '../../src/components/common';
import { Student, Attendance } from '../../src/types';
import { firestore } from '../../src/config/firebase';
import { collection, doc, getDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';

export default function ParentAttendanceScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
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
            getDoc(doc(firestore, 'students', id))
          )
        );

        const studentList = studentDocs
          .filter((docSnap) => docSnap.exists())
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Student[];

        setStudents(studentList);

        // Subscribe to attendance
        if (studentList.length > 0) {
          const studentIds = studentList.map((s) => s.id);

          const attendanceRef = collection(firestore, 'attendance');
          const q = query(
            attendanceRef,
            where('studentId', 'in', studentIds),
            orderBy('date', 'desc')
          );

          const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              setAttendance(
                snapshot.docs.map((docSnap) => ({
                  id: docSnap.id,
                  ...docSnap.data(),
                })) as Attendance[]
              );
              setLoading(false);
            },
            (error) => {
              console.error('Error fetching attendance:', error);
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

  const renderAttendance = ({ item }: { item: Attendance }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text variant="titleMedium">
              {item.date ? format(item.date.toDate(), 'EEEE, MMMM d, yyyy') : 'Today'}
            </Text>
            <Text variant="bodySmall" style={styles.studentName}>
              {getStudentName(item.studentId)}
            </Text>
            {item.notes && (
              <Text variant="bodySmall" style={styles.notes}>
                {item.notes}
              </Text>
            )}
          </View>
          <Chip
            compact
            style={{ backgroundColor: getStatusColor(item.status) }}
            textStyle={{ color: '#fff' }}
          >
            {item.status}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  if (loading) {
    return <LoadingSpinner message="Loading attendance..." />;
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
      {attendance.length > 0 ? (
        <FlatList
          data={attendance}
          renderItem={renderAttendance}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No attendance records yet.
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  studentName: {
    color: '#1a73e8',
    marginTop: 4,
  },
  notes: {
    color: '#666',
    marginTop: 4,
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
