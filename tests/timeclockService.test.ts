import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-ins: Cloud Function calls are scripted per test, and AsyncStorage is
// an in-memory map, so the offline End queue can be exercised end to end.
const fx = vi.hoisted(() => ({
  calls: [] as { name: string; data: unknown }[],
  respond: (_name: string, _data: unknown): unknown => ({ data: {} }),
  store: new Map<string, string>(),
}));

vi.mock('../src/config/firebase', () => ({ firestore: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  onSnapshot: vi.fn(),
  query: () => ({}),
  where: () => ({}),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => async (data: unknown) => {
    fx.calls.push({ name, data });
    const result = fx.respond(name, data);
    if (result instanceof Error) throw result;
    return result;
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => fx.store.get(k) ?? null,
    setItem: async (k: string, v: string) => void fx.store.set(k, v),
    removeItem: async (k: string) => void fx.store.delete(k),
  },
}));

import {
  endShift,
  flushPendingEnd,
  getMyTimekeeping,
  getPendingEnd,
  isRetryable,
  timeclockErrorMessage,
  timeclockErrorReason,
} from '../src/services/timeclock.service';

const failure = (code: string, message = 'server says no', reason?: string) =>
  Object.assign(new Error(message), { code, details: reason ? { reason } : undefined });

beforeEach(() => {
  fx.calls = [];
  fx.respond = () => ({ data: {} });
  fx.store.clear();
  vi.useRealTimers();
});

describe('getMyTimekeeping', () => {
  it('sends the org hints', async () => {
    fx.respond = () => ({ data: { now: 1, earlyStartMs: 900000, orgs: [] } });
    await getMyTimekeeping(['a', 'b']);
    expect(fx.calls).toEqual([{ name: 'getMyTimekeeping', data: { orgIds: ['a', 'b'] } }]);
  });
});

describe('ending a shift', () => {
  it('ends straight away when online, with the tap time and no position', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    expect(await endShift('e1')).toBe('done');
    expect(fx.calls).toEqual([{ name: 'endShift', data: { entryId: 'e1', endedAt: 1_000_000 } }]);
    expect(await getPendingEnd()).toBeNull();
  });

  it('queues the end, with the tap time, when there is no connection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(2_000_000);
    fx.respond = () => failure('functions/unavailable');
    expect(await endShift('e1')).toBe('queued');
    expect(await getPendingEnd()).toEqual({ entryId: 'e1', endedAt: 2_000_000 });
  });

  it("doesn't queue a refusal: it won't succeed later either", async () => {
    fx.respond = () => failure('functions/permission-denied');
    await expect(endShift('e1')).rejects.toThrow();
    expect(await getPendingEnd()).toBeNull();
  });
});

describe('sending a queued end', () => {
  it('sends the original tap time, then forgets it', async () => {
    fx.store.set('@ilmtrack/pendingShiftEnd', JSON.stringify({ entryId: 'e1', endedAt: 123 }));
    await flushPendingEnd();
    expect(fx.calls).toEqual([{ name: 'endShift', data: { entryId: 'e1', endedAt: 123 } }]);
    expect(await getPendingEnd()).toBeNull();
  });

  it('keeps it while still offline', async () => {
    fx.store.set('@ilmtrack/pendingShiftEnd', JSON.stringify({ entryId: 'e1', endedAt: 123 }));
    fx.respond = () => failure('functions/deadline-exceeded');
    await flushPendingEnd();
    expect(await getPendingEnd()).toEqual({ entryId: 'e1', endedAt: 123 });
  });

  it('drops it when the server refuses for good', async () => {
    fx.store.set('@ilmtrack/pendingShiftEnd', JSON.stringify({ entryId: 'e1', endedAt: 123 }));
    fx.respond = () => failure('functions/not-found');
    await flushPendingEnd();
    expect(await getPendingEnd()).toBeNull();
  });

  it('does nothing when nothing is queued', async () => {
    await flushPendingEnd();
    expect(fx.calls).toEqual([]);
  });
});

describe('error messages', () => {
  it("shows the server's own wording for its refusals", () => {
    const e = failure('functions/failed-precondition', "You're about 2.1 km from Main campus.", 'too-far');
    expect(timeclockErrorMessage(e, 'fallback')).toBe("You're about 2.1 km from Main campus.");
    expect(timeclockErrorReason(e)).toBe('too-far');
  });

  it('hides anything else behind the fallback', () => {
    expect(timeclockErrorMessage(failure('functions/internal', 'INTERNAL'), 'fallback')).toBe('fallback');
    expect(timeclockErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('treats only no-answer failures as worth retrying', () => {
    expect(isRetryable(failure('functions/unavailable'))).toBe(true);
    expect(isRetryable(failure('functions/failed-precondition'))).toBe(false);
  });
});
