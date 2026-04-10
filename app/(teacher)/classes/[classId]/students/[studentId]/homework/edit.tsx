import React, { useState, useEffect } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../../../../../../src/config/firebase';
import { updateHomework } from '../../../../../../../src/services/homework.service';
import { Button, Input, AppSnackbar, LoadingSpinner } from '../../../../../../../src/components/common';

const schema = yup.object({
  title: yup.string().required('Title is required'),
  description: yup.string(),
  notes: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

export default function EditHomeworkScreen() {
  const { homeworkId } = useLocalSearchParams<{ homeworkId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: { title: '', description: '', notes: '' },
  });

  useEffect(() => {
    if (!homeworkId) return;
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'homework', homeworkId));
        if (snap.exists()) {
          const data = snap.data();
          reset({
            title: data.title ?? '',
            description: data.description ?? '',
            notes: data.notes ?? '',
          });
        }
      } catch (err) {
        console.error('Error fetching homework:', err);
        setError('Failed to load homework.');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [homeworkId, reset]);

  const onSubmit = async (data: FormData) => {
    if (!homeworkId) return;
    setSaving(true);
    setError(null);
    try {
      await updateHomework(homeworkId, {
        title: data.title,
        description: data.description,
        notes: data.notes,
      });
      router.back();
    } catch (err: any) {
      console.error('Error updating homework:', err);
      setError('Failed to update homework. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

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
            <Button onPress={handleSubmit(onSubmit)} loading={saving} disabled={saving}>
              Save Changes
            </Button>

            <Button mode="outlined" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppSnackbar message={error} onDismiss={() => setError(null)} />
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
