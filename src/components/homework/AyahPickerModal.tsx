import React, { useMemo } from 'react';
import { StyleSheet, View, FlatList, Dimensions, Modal, TouchableWithoutFeedback } from 'react-native';
import { Tappable } from '../common';
import { Text } from 'react-native-paper';
import { colors, fontWeight, radius, spacing, typography } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const NUM_COLUMNS = 5;

interface AyahPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (ayah: number) => void;
  surahName: string;
  ayahCount: number;
}

export function AyahPickerModal({
  visible,
  onDismiss,
  onSelect,
  surahName,
  ayahCount,
}: AyahPickerModalProps) {
  const ayahs = useMemo(
    () => Array.from({ length: ayahCount }, (_, i) => i + 1),
    [ayahCount]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text variant={typography.h3} style={styles.title}>Select Ayah</Text>
              <Text variant={typography.body} style={styles.subtitle}>{surahName}</Text>
              <FlatList
                data={ayahs}
                keyExtractor={(item) => String(item)}
                numColumns={NUM_COLUMNS}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Tappable
                    style={styles.ayahButton}
                    onPress={() => onSelect(item)}
                  >
                    <Text variant={typography.bodyLarge} style={styles.ayahText}>{item}</Text>
                  </Tappable>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    maxHeight: SCREEN_HEIGHT * 0.6,
    width: '90%',
    overflow: 'hidden',
  },
  title: {
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  subtitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    color: colors.textSecondary,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  ayahButton: {
    flex: 1,
    margin: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ayahText: {
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
});
