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
              <Text variant="titleLarge" style={styles.title}>Select Ayah</Text>
              <Text variant="bodyMedium" style={styles.subtitle}>{surahName}</Text>
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
                    <Text variant="bodyLarge" style={styles.ayahText}>{item}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    maxHeight: SCREEN_HEIGHT * 0.6,
    width: '90%',
    overflow: 'hidden',
  },
  title: {
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    color: '#666',
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
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ayahText: {
    fontWeight: '500',
    color: '#333',
  },
});
