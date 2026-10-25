import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { auth } from '../config/firebase';
import { subscribeToMyOrganizations } from '../services/organization.service';
import { getSelectedOrgId, setSelectedOrgId } from '../utils/storage';
import type { Organization } from '../types';

/**
 * The organizations the signed-in teacher administers, and which one the
 * Organization tab is showing.
 *
 * The selection affects that tab only. The Classes tab always shows the
 * classes the user teaches, whichever organization is selected here.
 */
interface OrganizationContextType {
  /** Empty for anyone who administers no organization; the tab is hidden then. */
  organizations: Organization[];
  selectedOrg: Organization | null;
  selectOrg: (orgId: string) => Promise<void>;
  loading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSelectedOrgId().then(setSelectedOrgIdState);
  }, []);

  const uid = user?.uid;
  const isTeacher = user?.role === 'teacher';

  useEffect(() => {
    if (!uid || !isTeacher) {
      setOrganizations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    return subscribeToMyOrganizations(
      uid,
      (orgs) => {
        setOrganizations(orgs);
        setLoading(false);
      },
      (error) => {
        // Hiding the tab is the safe failure: nothing else depends on it.
        // During sign-out the listener can be denied before this effect is
        // cleaned up; that is expected, so only log while still signed in.
        if (auth.currentUser) console.error('Error loading organizations:', error);
        setOrganizations([]);
        setLoading(false);
      }
    );
  }, [uid, isTeacher]);

  const selectOrg = useCallback(async (orgId: string) => {
    setSelectedOrgIdState(orgId);
    await setSelectedOrgId(orgId);
  }, []);

  // Fall back to the first organization when nothing is stored yet, or the
  // stored one is no longer administered by this user.
  const selectedOrg =
    organizations.find((o) => o.id === selectedOrgId) ?? organizations[0] ?? null;

  return (
    <OrganizationContext.Provider value={{ organizations, selectedOrg, selectOrg, loading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizations() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganizations must be used within an OrganizationProvider');
  }
  return context;
}
