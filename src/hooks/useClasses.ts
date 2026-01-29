import { useState, useEffect } from 'react';
import { Class } from '../types';
import { subscribeToClasses } from '../services/class.service';
import { useAuth } from '../contexts/AuthContext';

export function useClasses() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'teacher') {
      setClasses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToClasses(
      user.uid,
      (updatedClasses) => {
        setClasses(updatedClasses);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching classes:', err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  return { classes, loading, error };
}
