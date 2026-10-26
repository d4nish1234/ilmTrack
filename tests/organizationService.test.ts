import { describe, it, expect, vi } from 'vitest';

// The service creates collection references at load time. Stub Firebase so
// the pure helper can be tested without a network, as studentService.test.ts does.
vi.mock('../src/config/firebase', () => ({
  firestore: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  documentId: () => '__name__',
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: () => ({}),
  where: () => ({}),
}));

import { getDocs } from 'firebase/firestore';
import { getOrgTeachers, orgTeacherIds } from '../src/services/organization.service';

const snap = (docs: { id: string; data: object }[]) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });

describe('orgTeacherIds', () => {
  it('includes owners and co-teachers, once each', () => {
    expect(
      orgTeacherIds([
        { teacherId: 'a', adminUserIds: ['a', 'b'] },
        { teacherId: 'c', adminUserIds: ['c', 'b'] },
      ]).sort()
    ).toEqual(['a', 'b', 'c']);
  });

  it('includes the owner even before the trigger has written adminUserIds', () => {
    expect(orgTeacherIds([{ teacherId: 'a' }])).toEqual(['a']);
  });

  it('is empty for an organization with no classes', () => {
    expect(orgTeacherIds([])).toEqual([]);
  });
});

describe('getOrgTeachers', () => {
  it("includes the org's admins, who may track time without teaching a class", async () => {
    vi.mocked(getDocs)
      // classes in the org
      .mockResolvedValueOnce(snap([{ id: 'c1', data: { name: 'Hifz A', teacherId: 't1', adminUserIds: ['t1'] } }]) as never)
      // the users, in one batch
      .mockResolvedValueOnce(
        snap([
          { id: 't1', data: { firstName: 'Sara', lastName: 'M', email: 's@x.com' } },
          { id: 'a1', data: { firstName: 'Ali', lastName: 'K', email: 'a@x.com' } },
        ]) as never
      );
    const teachers = await getOrgTeachers('org1', ['a1', 't1']);
    expect(teachers.map((t) => [t.uid, t.classNames])).toEqual([
      ['a1', []],
      ['t1', ['Hifz A']],
    ]);
  });
});
