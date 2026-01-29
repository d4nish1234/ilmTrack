import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Snackbar, Portal } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import { createHomework } from '../../../../../../../src/services/homework.service';
import { Button, Input } from '../../../../../../../src/components/common';

const schema = yup.object({
  title: yup.string().required('Title is required'),
  description: yup.string(),
  notes: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

export default function AddHomeworkScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      notes: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!classId || !studentId || !user) return;

    setLoading(true);
    setError(null);

    try {
      await createHomework(studentId, classId, user.uid, {
        title: data.title,
        description: data.description,
        notes: data.notes,
      });
      router.back();
    } catch (err: any) {
      console.error('Error creating homework:', err);
      setError('Failed to add homework. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Input
            control={control}
            name="title"
            label="Title"
            placeholder="e.g., Chapter 5 Exercises"
          />

          <Input
            control={control}
            name="description"
            label="Description (Optional)"
            placeholder="Detailed description of the homework"
            multiline
            numberOfLines={4}
          />

          <Input
            control={control}
            name="notes"
            label="Notes (Optional)"
            placeholder="Any additional notes for the student"
            multiline
            numberOfLines={2}
          />

          <View style={styles.actions}>
            <Button onPress={handleSubmit(onSubmit)} loading={loading}>
              Add Homework
            </Button>

            <Button mode="outlined" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Snackbar
          visible={!!error}
          onDismiss={() => setError(null)}
          duration={4000}
        >
          {error}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  actions: {
    marginTop: 16,
  },
});
