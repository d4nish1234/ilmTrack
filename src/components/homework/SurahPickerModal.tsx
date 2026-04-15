import React, { useState, useMemo } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { Text, Modal, Portal, Searchbar } from 'react-native-paper';
import { QURAN_SURAHS, Surah } from '../../data/quranSurahs';

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
    <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
      <View style={styles.itemNumber}>
        <Text variant="titleMedium" style={styles.numberText}>{item.number}</Text>
      </View>
      <View style={styles.itemContent}>
        <Text variant="bodyLarge" style={styles.nameText}>{item.name}</Text>
        <Text variant="bodySmall" style={styles.metaText}>
          {item.ayahCount} ayahs
        </Text>
      </View>
      <Text variant="titleMedium" style={styles.arabicText}>{item.arabicName}</Text>
    </TouchableOpacity>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={styles.modal}
      >
        <Text variant="titleLarge" style={styles.title}>Select Surah</Text>
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
              <Text variant="bodyMedium" style={styles.emptyText}>No surahs found</Text>
            </View>
          }
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    maxHeight: SCREEN_HEIGHT * 0.7,
    overflow: 'hidden',
  },
  title: {
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 8,
    elevation: 0,
    backgroundColor: '#f5f5f5',
  },
  searchInput: {
    fontSize: 14,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8eaf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  numberText: {
    fontWeight: '600',
    fontSize: 14,
    color: '#3f51b5',
  },
  itemContent: {
    flex: 1,
  },
  nameText: {
    fontWeight: '500',
  },
  metaText: {
    color: '#666',
    marginTop: 2,
  },
  arabicText: {
    fontSize: 18,
    color: '#333',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 16,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
  },
});
