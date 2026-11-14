import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getStudent } from '../../../src/services/student.service';
import { DeleteList, DeleteNote, SettingsScreen } from '../../../src/components/settings/SettingsScreen';
import { Student } from '../../../src/types';

/** A parent's Settings: the shared screen, warning that deleting removes access to their children. */
export default function ParentSettingsScreen() {
  const { user, deleteAccount } = useAuth();
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);

  useEffect(() => {
    const fetchLinkedStudents = async () => {
      if (!user?.studentIds?.length) {
        setLinkedStudents([]);
        return;
      }
      const students: Student[] = [];
      for (const id of user.studentIds) {
        try {
          const s = await getStudent(id);
          if (s) students.push(s);
        } catch {
          // Skip students that can't be fetched
        }
      }
      setLinkedStudents(students);
    };
    fetchLinkedStudents();
  }, [user?.studentIds]);

  return (
    <SettingsScreen
      roleLabel="Parent"
      helpHref="/(parent)/settings/help"
      deleteSummary="Permanently delete your account and remove access to all linked children. This cannot be undone."
      deleteAccount={deleteAccount}
      deleteDetails={
        <>
          <DeleteList
            heading="You will lose access to:"
            items={linkedStudents.map((s) => ({ key: s.id, label: `${s.firstName} ${s.lastName}` }))}
          />
          <DeleteNote>
            If you re-create your account with the same email, you will be re-linked to your students automatically.
          </DeleteNote>
        </>
      }
    />
  );
}
