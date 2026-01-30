import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/AuthContext';
import { createClass } from '../../../src/services/class.service';
import { Button, Input } from '../../../src/components/common';

const schema = yup.object({
  name: yup.string().required('Class name is required'),
  description: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

export default function CreateClassScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      await createClass(user.uid, {
        name: data.name,
        description: data.description,
      });
      router.back();
    } catch (err: any) {
      console.error('Error creating class:', err);
      setError('Failed to create class. Please try again.');
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
        <View style={styles.form}>
          <Input
            control={control}
            name="name"
            label="Class Name"
            placeholder="e.g., Math 101, Grade 5"
            autoCapitalize="words"
          />

          <Input
            control={control}
            name="description"
            label="Description (Optional)"
            placeholder="Brief description of the class"
            multiline
            numberOfLines={3}
          />

          <Button onPress={handleSubmit(onSubmit)} loading={loading}>
            Create Class
          </Button>

          <Button mode="outlined" onPress={() => router.dismiss()}>
            Cancel
          </Button>
        </View>
      </KeyboardAvoidingView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={4000}
      >
        {error}
      </Snackbar>
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
  form: {
    padding: 16,
  },
});
