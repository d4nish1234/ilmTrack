import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getClassesByIds } from '../../../src/services/class.service';
import { DeleteList, DeleteNote, SettingsScreen } from '../../../src/components/settings/SettingsScreen';
import { Class } from '../../../src/types';

/** A teacher's Settings: the shared screen, warning that deleting removes their classes. */
export default function TeacherSettingsScreen() {
  const { user, deleteTeacherAccount } = useAuth();
  const [ownedClasses, setOwnedClasses] = useState<Class[]>([]);
  const [adminClasses, setAdminClasses] = useState<Class[]>([]);

  useEffect(() => {
    const fetchClasses = async () => {
      if (!user) return;
      try {
        if (user.classIds?.length) setOwnedClasses(await getClassesByIds(user.classIds));
      } catch (err) {
        console.error('Failed to fetch owned classes:', err);
      }
      try {
        if (user.adminClassIds?.length) {
          const admin = await getClassesByIds(user.adminClassIds);
          setAdminClasses(admin.filter((cls) => cls.admins?.some((a) => a.userId === user.uid)));
        }
      } catch (err) {
        console.error('Failed to fetch admin classes:', err);
      }
    };
    fetchClasses();
  }, [user?.classIds, user?.adminClassIds]);

  return (
    <SettingsScreen
      roleLabel="Teacher"
      helpHref="/(teacher)/settings/help"
      deleteSummary="Permanently delete your account, all your classes, students, and their records. This cannot be undone."
      deleteAccount={deleteTeacherAccount}
      deleteDetails={
        <>
          <DeleteList
            heading="The following classes and ALL their data will be permanently deleted:"
            items={ownedClasses.map((cls) => ({
              key: cls.id,
              label: `${cls.name} (${cls.studentCount} student${cls.studentCount !== 1 ? 's' : ''})`,
            }))}
          />
          <DeleteList
            heading="You will be removed as co-teacher from:"
            items={adminClasses.map((cls) => ({ key: cls.id, label: cls.name }))}
          />
          <DeleteNote warning>This action cannot be undone.</DeleteNote>
        </>
      }
    />
  );
}
