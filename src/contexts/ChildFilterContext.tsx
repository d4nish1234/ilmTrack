import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChildFilterContextType {
  selectedChildId: string | null; // null means "All Children"
  setSelectedChildId: (id: string | null) => void;
}

const ChildFilterContext = createContext<ChildFilterContextType | undefined>(undefined);

export function ChildFilterProvider({ children }: { children: ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  return (
    <ChildFilterContext.Provider value={{ selectedChildId, setSelectedChildId }}>
      {children}
    </ChildFilterContext.Provider>
  );
}

export function useChildFilter() {
  const context = useContext(ChildFilterContext);
  if (context === undefined) {
    throw new Error('useChildFilter must be used within a ChildFilterProvider');
  }
  return context;
}
