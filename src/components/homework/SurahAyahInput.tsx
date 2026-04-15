import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { QURAN_SURAHS, Surah, getNextAyahPosition, composeSurahAyahTitle } from '../../data/quranSurahs';
import { SurahPickerModal } from './SurahPickerModal';
import { AyahPickerModal } from './AyahPickerModal';

export interface SurahAyahSelection {
  fromSurah: Surah | null;
  fromAyah: number | null;
  toSurah: Surah | null;
  toAyah: number | null;
}

interface SurahAyahInputProps {
  value: SurahAyahSelection;
  onChange: (selection: SurahAyahSelection) => void;
  onTitleChange: (title: string) => void;
}

type PickerTarget = 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah';

export function SurahAyahInput({ value, onChange, onTitleChange }: SurahAyahInputProps) {
  const [surahPickerVisible, setSurahPickerVisible] = useState(false);
  const [ayahPickerVisible, setAyahPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('fromSurah');

  // Update composed title whenever selections change
  useEffect(() => {
    if (value.fromSurah && value.fromAyah && value.toSurah && value.toAyah) {
      const title = composeSurahAyahTitle(
        value.fromSurah.number,
        value.fromAyah,
        value.toSurah.number,
        value.toAyah
      );
      onTitleChange(title);
    }
  }, [value.fromSurah, value.fromAyah, value.toSurah, value.toAyah]);

  const openSurahPicker = (target: 'fromSurah' | 'toSurah') => {
    setPickerTarget(target);
    setSurahPickerVisible(true);
  };

  const openAyahPicker = (target: 'fromAyah' | 'toAyah') => {
    // Only allow if surah is selected
    const surah = target === 'fromAyah' ? value.fromSurah : value.toSurah;
    if (!surah) return;
    setPickerTarget(target);
    setAyahPickerVisible(true);
  };

  const handleSurahSelect = (surah: Surah) => {
    setSurahPickerVisible(false);
    if (pickerTarget === 'fromSurah') {
      const updated: SurahAyahSelection = {
        ...value,
        fromSurah: surah,
        fromAyah: value.fromAyah || 1,
        toSurah: value.toSurah,
        toAyah: value.toAyah,
      };
      // Auto-fill "To" based on "From"
      if (updated.fromAyah) {
        const next = getNextAyahPosition(surah.number, updated.fromAyah);
        const nextSurah = QURAN_SURAHS.find((s) => s.number === next.surahNumber);
        updated.toSurah = nextSurah || surah;
        updated.toAyah = next.ayah;
      }
      onChange(updated);
    } else {
      // toSurah selected - reset toAyah if surah changed
      const ayahReset = value.toSurah?.number !== surah.number ? null : value.toAyah;
      onChange({ ...value, toSurah: surah, toAyah: ayahReset || 1 });
    }
  };

  const handleAyahSelect = (ayah: number) => {
    setAyahPickerVisible(false);
    if (pickerTarget === 'fromAyah') {
      const updated: SurahAyahSelection = {
        ...value,
        fromAyah: ayah,
      };
      // Auto-fill "To"
      if (value.fromSurah) {
        const next = getNextAyahPosition(value.fromSurah.number, ayah);
        const nextSurah = QURAN_SURAHS.find((s) => s.number === next.surahNumber);
        updated.toSurah = nextSurah || value.fromSurah;
        updated.toAyah = next.ayah;
      }
      onChange(updated);
    } else {
      onChange({ ...value, toAyah: ayah });
    }
  };

  // For ayah picker: determine which surah's ayah count to use
  const getAyahPickerProps = () => {
    const surah = pickerTarget === 'fromAyah' ? value.fromSurah : value.toSurah;
    return {
      surahName: surah?.name || '',
      ayahCount: surah?.ayahCount || 1,
    };
  };

  return (
    <View style={styles.container}>
      {/* From Row */}
      <Text variant="labelLarge" style={styles.rowLabel}>From</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.field}
          onPress={() => openSurahPicker('fromSurah')}
        >
          <Text variant="bodySmall" style={styles.fieldLabel}>Surah</Text>
          <Text
            variant="bodyLarge"
            style={[styles.fieldValue, !value.fromSurah && styles.placeholder]}
            numberOfLines={1}
          >
            {value.fromSurah ? value.fromSurah.name : 'Select'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.field, styles.ayahField, !value.fromSurah && styles.fieldDisabled]}
          onPress={() => openAyahPicker('fromAyah')}
          disabled={!value.fromSurah}
        >
          <Text variant="bodySmall" style={styles.fieldLabel}>Ayah</Text>
          <Text
            variant="bodyLarge"
            style={[styles.fieldValue, !value.fromAyah && styles.placeholder]}
          >
            {value.fromAyah ?? 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* To Row */}
      <Text variant="labelLarge" style={styles.rowLabel}>To</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.field}
          onPress={() => openSurahPicker('toSurah')}
        >
          <Text variant="bodySmall" style={styles.fieldLabel}>Surah</Text>
          <Text
            variant="bodyLarge"
            style={[styles.fieldValue, !value.toSurah && styles.placeholder]}
            numberOfLines={1}
          >
            {value.toSurah ? value.toSurah.name : 'Select'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.field, styles.ayahField, !value.toSurah && styles.fieldDisabled]}
          onPress={() => openAyahPicker('toAyah')}
          disabled={!value.toSurah}
        >
          <Text variant="bodySmall" style={styles.fieldLabel}>Ayah</Text>
          <Text
            variant="bodyLarge"
            style={[styles.fieldValue, !value.toAyah && styles.placeholder]}
          >
            {value.toAyah ?? 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Surah Picker Modal */}
      <SurahPickerModal
        visible={surahPickerVisible}
        onDismiss={() => setSurahPickerVisible(false)}
        onSelect={handleSurahSelect}
      />

      {/* Ayah Picker Modal */}
      <AyahPickerModal
        visible={ayahPickerVisible}
        onDismiss={() => setAyahPickerVisible(false)}
        onSelect={handleAyahSelect}
        {...getAyahPickerProps()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  rowLabel: {
    color: '#666',
    marginBottom: 4,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  field: {
    flex: 3,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  ayahField: {
    flex: 1,
  },
  fieldDisabled: {
    opacity: 0.5,
  },
  fieldLabel: {
    color: '#666',
    marginBottom: 2,
  },
  fieldValue: {
    fontWeight: '500',
  },
  placeholder: {
    color: '#999',
    fontWeight: '400',
  },
});
