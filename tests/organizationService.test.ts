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

import { orgTeacherIds } from '../src/services/organization.service';

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
