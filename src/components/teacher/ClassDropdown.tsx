import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { router } from 'expo-router';
import { useClasses } from '../../hooks/useClasses';
import { useSelectedClass } from '../../hooks/useSelectedClass';
import { colors, fontSize, fontWeight, radius, spacing } from '../../constants/theme';

const CREATE_CLASS_VALUE = '__CREATE_NEW_CLASS__';

interface ClassDropdownProps {
  onClassChange?: (classId: string | null) => void;
}

export function ClassDropdown({ onClassChange }: ClassDropdownProps) {
  const { classes, loading: classesLoading } = useClasses();
  const { selectedClassId, selectClass, loading: selectedLoading } =
    useSelectedClass();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(selectedClassId);

  const items = [
    ...classes.map((cls) => ({
      label: cls.name,
      value: cls.id,
    })),
    {
      label: '+ Create New Class',
      value: CREATE_CLASS_VALUE,
      labelStyle: styles.createNewLabel,
    },
  ];

  // Sync with selectedClassId from storage
  useEffect(() => {
    if (!selectedLoading && selectedClassId !== value) {
      setValue(selectedClassId);
    }
  }, [selectedClassId, selectedLoading, value]);

  // Auto-select first class if none selected
  useEffect(() => {
    if (!selectedLoading && !classesLoading && !selectedClassId && classes.length > 0) {
      selectClass(classes[0].id);
    }
  }, [classes, selectedClassId, selectedLoading, classesLoading, selectClass]);

  const handleValueChange = (newValue: string | null) => {
    if (newValue === CREATE_CLASS_VALUE) {
      // Navigate to classes tab first, then to create screen
      setOpen(false);
      router.navigate('/(teacher)/classes');
      // Small delay to ensure tab switch completes before pushing modal
      setTimeout(() => {
        router.push('/(teacher)/classes/create');
      }, 50);
      return;
    }
    setValue(newValue);
    if (newValue) {
      selectClass(newValue);
      onClassChange?.(newValue);
    }
  };

  if (classesLoading || selectedLoading) {
    return null;
  }

  if (classes.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <DropDownPicker
        open={open}
        value={value}
        items={items}
        setOpen={setOpen}
        setValue={(callback) => {
          const newValue =
            typeof callback === 'function' ? callback(value) : callback;
          handleValueChange(newValue);
        }}
        placeholder="Select a class"
        style={styles.dropdown}
        dropDownContainerStyle={styles.dropdownContainer}
        textStyle={styles.text}
        placeholderStyle={styles.placeholder}
        zIndex={1000}
        zIndexInverse={3000}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  dropdownContainer: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  text: {
    fontSize: fontSize.lg,
  },
  placeholder: {
    color: colors.textDisabled,
  },
  createNewLabel: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});
