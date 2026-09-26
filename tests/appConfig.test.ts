/**
 * fetchAppConfig must never throw and never hang.
 *
 * It gates the entire app, so every failure path has to resolve to null —
 * which callers read as "no restriction". A bug here locks every user out of
 * IlmTrack, which is strictly worse than serving a build that should have
 * been retired.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDoc = vi.fn();
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), getDoc: (...a: unknown[]) => getDoc(...a) }));
vi.mock('../src/config/firebase', () => ({ firestore: {} }));

const { fetchAppConfig } = await import('../src/services/appConfig.service');

beforeEach(() => {
  getDoc.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchAppConfig', () => {
  it('returns the config when the document exists', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ minSupportedVersion: '1.4' }) });
    await expect(fetchAppConfig()).resolves.toEqual({ minSupportedVersion: '1.4' });
  });

  it('returns null when the document does not exist', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(fetchAppConfig()).resolves.toBeNull();
  });

  it('returns null instead of throwing when offline', async () => {
    getDoc.mockRejectedValue(Object.assign(new Error('client is offline'), { code: 'unavailable' }));
    await expect(fetchAppConfig()).resolves.toBeNull();
  });

  it('returns null instead of throwing when rules deny the read', async () => {
    getDoc.mockRejectedValue(Object.assign(new Error('Missing permissions'), { code: 'permission-denied' }));
    await expect(fetchAppConfig()).resolves.toBeNull();
  });

  it('gives up rather than hanging when Firestore never answers', async () => {
    vi.useFakeTimers();
    getDoc.mockReturnValue(new Promise(() => {})); // never settles
    const pending = fetchAppConfig();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBeNull();
  });

  it('does not resolve early while Firestore is still answering', async () => {
    vi.useFakeTimers();
    let settle: (v: unknown) => void = () => {};
    getDoc.mockReturnValue(new Promise((r) => { settle = r; }));
    const pending = fetchAppConfig();

    let done = false;
    void pending.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(4000);
    expect(done).toBe(false);

    settle({ exists: () => true, data: () => ({ minSupportedVersion: '2.0' }) });
    await expect(pending).resolves.toEqual({ minSupportedVersion: '2.0' });
  });
});
