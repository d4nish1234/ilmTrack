import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { useClasses } from '../../hooks/useClasses';
import { useSelectedClass } from '../../hooks/useSelectedClass';

interface ClassDropdownProps {
  onClassChange?: (classId: string | null) => void;
}

export function ClassDropdown({ onClassChange }: ClassDropdownProps) {
  const { classes, loading: classesLoading } = useClasses();
  const { selectedClassId, selectClass, loading: selectedLoading } =
    useSelectedClass();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(selectedClassId);

  const items = classes.map((cls) => ({
    label: cls.name,
    value: cls.id,
  }));

  // Sync with selectedClassId from storage
  useEffect(() => {
    if (!selectedLoading && selectedClassId !== value) {
      setValue(selectedClassId);
    }
  }, [selectedClassId, selectedLoading]);

  // Auto-select first class if none selected
  useEffect(() => {
    if (!selectedLoading && !classesLoading && !selectedClassId && classes.length > 0) {
      selectClass(classes[0].id);
    }
  }, [classes, selectedClassId, selectedLoading, classesLoading, selectClass]);

  const handleValueChange = (newValue: string | null) => {
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
    borderRadius: 8,
  },
  dropdownContainer: {
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderRadius: 8,
  },
  text: {
    fontSize: 16,
  },
  placeholder: {
    color: '#999',
  },
});
