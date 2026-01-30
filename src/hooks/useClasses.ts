import { useState, useEffect, useRef } from 'react';
import { Class } from '../types';
import { subscribeToClasses, subscribeToClassesByIds } from '../services/class.service';
import { useAuth } from '../contexts/AuthContext';

export function useClasses() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use refs to track owned and admin classes separately
  const ownedClassesRef = useRef<Class[]>([]);
  const adminClassesRef = useRef<Class[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'teacher') {
      setClasses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let ownedLoaded = false;
    let adminLoaded = false;

    const updateCombinedClasses = () => {
      // Combine owned and admin classes, removing duplicates
      const allClasses = [...ownedClassesRef.current];
      adminClassesRef.current.forEach((adminClass) => {
        if (!allClasses.some((c) => c.id === adminClass.id)) {
          allClasses.push(adminClass);
        }
      });
      // Sort by creation date (newest first)
      allClasses.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setClasses(allClasses);
    };

    // Subscribe to owned classes
    const unsubscribeOwned = subscribeToClasses(
      user.uid,
      (updatedClasses) => {
        ownedClassesRef.current = updatedClasses;
        ownedLoaded = true;
        if (ownedLoaded && adminLoaded) {
          setLoading(false);
        }
        updateCombinedClasses();
        setError(null);
      },
      (err) => {
        console.error('Error fetching owned classes:', err);
        setError(err);
        ownedLoaded = true;
        if (ownedLoaded && adminLoaded) {
          setLoading(false);
        }
      }
    );

    // Subscribe to admin classes if user has any
    const adminClassIds = user.adminClassIds || [];
    let unsubscribeAdmin = () => {};

    if (adminClassIds.length > 0) {
      unsubscribeAdmin = subscribeToClassesByIds(
        adminClassIds,
        (updatedClasses) => {
          adminClassesRef.current = updatedClasses;
          adminLoaded = true;
          if (ownedLoaded && adminLoaded) {
            setLoading(false);
          }
          updateCombinedClasses();
        },
        (err) => {
          console.error('Error fetching admin classes:', err);
          adminLoaded = true;
          if (ownedLoaded && adminLoaded) {
            setLoading(false);
          }
        }
      );
    } else {
      adminLoaded = true;
      adminClassesRef.current = [];
    }

    return () => {
      unsubscribeOwned();
      unsubscribeAdmin();
    };
  }, [user]);

  return { classes, loading, error };
}
