import React, { useState, useMemo } from 'react';
import { StyleSheet, View, FlatList, Dimensions, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { Tappable } from '../common';
import { Text, Searchbar } from 'react-native-paper';
import { QURAN_SURAHS, Surah } from '../../data/quranSurahs';
import { colors, fontSize, fontWeight, radius, spacing, typography } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SurahPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (surah: Surah) => void;
}

export function SurahPickerModal({ visible, onDismiss, onSelect }: SurahPickerModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return QURAN_SURAHS;
    const q = search.toLowerCase().trim();
    return QURAN_SURAHS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.arabicName.includes(q) ||
        String(s.number).includes(q)
    );
  }, [search]);

  const handleSelect = (surah: Surah) => {
    onSelect(surah);
    setSearch('');
  };

  const handleDismiss = () => {
    setSearch('');
    onDismiss();
  };

  const renderItem = ({ item }: { item: Surah }) => (
    <Tappable style={styles.item} onPress={() => handleSelect(item)}>
      <View style={styles.itemNumber}>
        <Text variant={typography.h4} style={styles.numberText}>{item.number}</Text>
      </View>
      <View style={styles.itemContent}>
        <Text variant={typography.bodyLarge} style={styles.nameText}>{item.name}</Text>
        <Text variant={typography.caption} style={styles.metaText}>
          {item.ayahCount} ayahs
        </Text>
      </View>
      <Text variant={typography.h4} style={styles.arabicText}>{item.arabicName}</Text>
    </Tappable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalContent}
            >
              <Text variant={typography.h3} style={styles.title}>Select Surah</Text>
              <Searchbar
                placeholder="Search by name or number..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchbar}
                inputStyle={styles.searchInput}
              />
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.number)}
                renderItem={renderItem}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text variant={typography.body} style={styles.emptyText}>No surahs found</Text>
                  </View>
                }
              />
            </KeyboardAvoidingView>
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
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    maxHeight: SCREEN_HEIGHT * 0.7,
    width: '90%',
    overflow: 'hidden',
  },
  title: {
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchbar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    elevation: 0,
    backgroundColor: colors.surface,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  numberText: {
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  itemContent: {
    flex: 1,
  },
  nameText: {
    fontWeight: fontWeight.medium,
  },
  metaText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  arabicText: {
    fontSize: fontSize.xl,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDisabled,
  },
});
