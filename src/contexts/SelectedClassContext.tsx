import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  getSelectedClassId,
  setSelectedClassId as saveSelectedClassId,
  clearSelectedClassId,
} from '../utils/storage';

interface SelectedClassContextType {
  selectedClassId: string | null;
  selectClass: (classId: string) => Promise<void>;
  clearSelection: () => Promise<void>;
  loading: boolean;
}

const SelectedClassContext = createContext<SelectedClassContextType | undefined>(undefined);

export function SelectedClassProvider({ children }: { children: ReactNode }) {
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

  return (
    <SelectedClassContext.Provider
      value={{
        selectedClassId,
        selectClass,
        clearSelection,
        loading,
      }}
    >
      {children}
    </SelectedClassContext.Provider>
  );
}

export function useSelectedClass() {
  const context = useContext(SelectedClassContext);
  if (context === undefined) {
    throw new Error('useSelectedClass must be used within a SelectedClassProvider');
  }
  return context;
}
