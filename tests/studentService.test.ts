import { describe, it, expect, vi } from 'vitest';

// The student service module imports `firestore` and `functions` at load time.
// Those side-effects don't matter for the pure helper we're testing, but vitest
// will still load Firebase. Stub the config module so we don't need a network.
vi.mock('../src/config/firebase', () => ({
  firestore: {},
  functions: {},
}));

// Stub firebase/firestore so module-level `collection(firestore, 'students')`
// doesn't require a real FirebaseFirestore instance.
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  query: () => ({}),
  where: () => ({}),
  onSnapshot: vi.fn(),
  serverTimestamp: () => null,
  arrayUnion: (...args: any[]) => args,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: null }),
}));

import { getParentUserIds } from '../src/services/student.service';
import type { Parent } from '../src/types';

const mkParent = (overrides: Partial<Parent>): Parent => ({
  firstName: 'F',
  lastName: 'L',
  email: 'p@test.com',
  inviteStatus: 'pending',
  ...overrides,
});

describe('getParentUserIds', () => {
  it('returns empty for empty array', () => {
    expect(getParentUserIds([])).toEqual([]);
  });

  it('skips parents without userId', () => {
    expect(getParentUserIds([mkParent({ inviteStatus: 'accepted' })])).toEqual([]);
  });

  it('skips parents whose invite is not accepted', () => {
    expect(
      getParentUserIds([
        mkParent({ userId: 'u1', inviteStatus: 'pending' }),
        mkParent({ userId: 'u2', inviteStatus: 'sent' }),
      ])
    ).toEqual([]);
  });

  it('returns only accepted parents with a userId', () => {
    const result = getParentUserIds([
      mkParent({ userId: 'u1', inviteStatus: 'accepted' }),
      mkParent({ userId: 'u2', inviteStatus: 'pending' }),
      mkParent({ userId: 'u3', inviteStatus: 'accepted' }),
      mkParent({ inviteStatus: 'accepted' }), // no userId
    ]);
    expect(result).toEqual(['u1', 'u3']);
  });
});
