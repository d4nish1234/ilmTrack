import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fontWeight, radius, typography } from '../../constants/theme';

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
                  <TouchableOpacity
                    style={styles.ayahButton}
                    onPress={() => onSelect(item)}
                  >
                    <Text variant={typography.bodyLarge} style={styles.ayahText}>{item}</Text>
                  </TouchableOpacity>
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
    backgroundColor: colors.background,
    marginHorizontal: 16,
    borderRadius: radius.lg,
    maxHeight: SCREEN_HEIGHT * 0.6,
    width: '90%',
    overflow: 'hidden',
  },
  title: {
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    color: colors.textSecondary,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  ayahButton: {
    flex: 1,
    margin: 4,
    paddingVertical: 12,
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
