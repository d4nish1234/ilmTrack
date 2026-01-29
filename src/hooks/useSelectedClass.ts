import { useState, useEffect, useCallback } from 'react';
import {
  getSelectedClassId,
  setSelectedClassId as saveSelectedClassId,
  clearSelectedClassId,
} from '../utils/storage';

export function useSelectedClass() {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSelectedClass();
  }, []);

  const loadSelectedClass = async () => {
    try {
      const storedClassId = await getSelectedClassId();
      setSelectedClassId(storedClassId);
    } catch (error) {
      console.error('Error loading selected class:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectClass = useCallback(async (classId: string) => {
    try {
      await saveSelectedClassId(classId);
      setSelectedClassId(classId);
    } catch (error) {
      console.error('Error saving selected class:', error);
    }
  }, []);

  const clearSelection = useCallback(async () => {
    try {
      await clearSelectedClassId();
      setSelectedClassId(null);
    } catch (error) {
      console.error('Error clearing selected class:', error);
    }
  }, []);

  return {
    selectedClassId,
    selectClass,
    clearSelection,
    loading,
  };
}
