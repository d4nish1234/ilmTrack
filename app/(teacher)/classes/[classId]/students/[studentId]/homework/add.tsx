import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView, Modal as RNModal, TouchableOpacity, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Text } from 'react-native-paper';
import { useAuth } from '../../../../../../../src/contexts/AuthContext';
import { createHomework } from '../../../../../../../src/services/homework.service';
import { getStudent, getInvitedTeacherIds, updateStudentSurahAyahMode } from '../../../../../../../src/services/student.service';
import { Button, Input, AppSnackbar } from '../../../../../../../src/components/common';
import { SurahAyahInput, SurahAyahSelection } from '../../../../../../../src/components/homework/SurahAyahInput';
import { Student } from '../../../../../../../src/types';

const schema = yup.object({
  title: yup.string().required('Title is required'),
  description: yup.string(),
  notes: yup.string(),
});

type FormData = yup.InferType<typeof schema>;

const MENU_DEBOUNCE_MS = 300;

export default function AddHomeworkScreen() {
  const { classId, studentId } = useLocalSearchParams<{
    classId: string;
    studentId: string;
  }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);

  // Menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuAnchorRef = useRef<View>(null);
  const lastMenuActionRef = useRef(0);

  // Quran Mode state
  const [quranMode, setQuranMode] = useState(false);
  const [surahAyah, setSurahAyah] = useState<SurahAyahSelection>({
    fromSurah: null,
    fromAyah: null,
    toSurah: null,
    toAyah: null,
  });

  useEffect(() => {
    if (studentId) {
      getStudent(studentId).then((s) => {
        setStudent(s);
        if (s?.surahAyahMode) {
          setQuranMode(true);
        }
      });
    }
  }, [studentId]);

  const { control, handleSubmit, setValue } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      notes: '',
    },
  });

  const openMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastMenuActionRef.current < MENU_DEBOUNCE_MS) return;
    lastMenuActionRef.current = now;
    menuAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({ top: y + height, right: Dimensions.get('window').width - x - width });
      setMenuVisible(true);
    });
  }, []);

  const closeMenu = useCallback(() => {
    lastMenuActionRef.current = Date.now();
    setMenuVisible(false);
  }, []);

  const toggleQuranMode = async () => {
    closeMenu();
    const newMode = !quranMode;
    setQuranMode(newMode);

    // Persist setting to student doc
    if (studentId) {
      try {
        await updateStudentSurahAyahMode(studentId, newMode);
      } catch (err) {
        console.error('Failed to update Quran mode:', err);
      }
    }

    // If disabling, the composed title stays in the title field as free text
    // If enabling, reset surah/ayah selection
    if (newMode) {
      setSurahAyah({
        fromSurah: null,
        fromAyah: null,
        toSurah: null,
        toAyah: null,
      });
    }
  };

  const handleSurahTitleChange = (title: string) => {
    setValue('title', title);
  };

  const onSubmit = async (data: FormData) => {
    if (!classId || !studentId || !user) return;

    setLoading(true);
    setError(null);

    try {
      const freshTeacherIds = await getInvitedTeacherIds(classId);
      await createHomework(studentId, classId, user.uid, {
        title: data.title,
        description: data.description,
        notes: data.notes,
      }, student?.parentUserIds || [], freshTeacherIds);
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
      <Stack.Screen
        options={{
          headerRight: () => (
            <View ref={menuAnchorRef}>
              <IconButton
                icon="dots-vertical"
                iconColor="#fff"
                size={24}
                onPress={openMenu}
                style={styles.headerButton}
              />
            </View>
          ),
        }}
      />

      <RNModal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.menuBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuContent, { position: 'absolute', top: menuPosition.top, right: menuPosition.right }]}>
                <TouchableOpacity style={styles.menuItem} onPress={toggleQuranMode}>
                  {quranMode && (
                    <IconButton icon="check" size={20} style={styles.menuIcon} />
                  )}
                  <Text variant="bodyLarge" style={[styles.menuText, !quranMode && styles.menuTextNoIcon]}>
                    Quran Mode
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {quranMode ? (
            <SurahAyahInput
              value={surahAyah}
              onChange={setSurahAyah}
              onTitleChange={handleSurahTitleChange}
            />
          ) : (
            <Input
              control={control}
              name="title"
              label="Title"
              placeholder="e.g., Chapter 5 Exercises"
            />
          )}

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
  headerButton: {
    margin: 0,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  menuContent: {
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
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuIcon: {
    margin: 0,
    marginRight: 4,
  },
  menuText: {
    fontSize: 16,
  },
  menuTextNoIcon: {
    paddingLeft: 8,
  },
});
