import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A scriptable stand-in for expo-location: each test sets the permission,
// whether services are on, and what the position watch delivers and when.
const loc = vi.hoisted(() => ({
  permission: { status: 'granted', canAskAgain: true } as Record<string, unknown>,
  requested: null as Record<string, unknown> | null,
  servicesOn: true,
  readings: [] as { coords: { latitude: number; longitude: number; accuracy: number }; mocked?: boolean }[],
  /** ms before the watch subscription itself resolves */
  watchStartsAfter: 0,
  /** ms between readings */
  readingEvery: 100,
  current: null as unknown,
  removed: 0,
}));

vi.mock('expo-location', () => ({
  Accuracy: { Highest: 6 },
  getForegroundPermissionsAsync: vi.fn(async () => loc.permission),
  requestForegroundPermissionsAsync: vi.fn(async () => loc.requested ?? loc.permission),
  hasServicesEnabledAsync: vi.fn(async () => loc.servicesOn),
  getCurrentPositionAsync: vi.fn(async () => {
    if (!loc.current) throw new Error('no fix');
    return loc.current;
  }),
  watchPositionAsync: vi.fn(async (_opts: unknown, onReading: (r: unknown) => void) => {
    loc.readings.forEach((r, i) => setTimeout(() => onReading(r), loc.watchStartsAfter + (i + 1) * loc.readingEvery));
    await new Promise((resolve) => setTimeout(resolve, loc.watchStartsAfter));
    return { remove: () => loc.removed++ };
  }),
}));

import { getShiftPosition, hasAskedForLocation } from '../src/services/shiftLocation.service';

const reading = (accuracy: number, mocked?: boolean) => ({
  coords: { latitude: 43.7, longitude: -79.7, accuracy },
  ...(mocked === undefined ? {} : { mocked }),
});

/** Run getShiftPosition to completion under fake timers. */
async function locate() {
  const result = getShiftPosition();
  await vi.runAllTimersAsync();
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  loc.permission = { status: 'granted', canAskAgain: true, ios: { accuracy: 'full' } };
  loc.requested = null;
  loc.servicesOn = true;
  loc.readings = [];
  loc.watchStartsAfter = 0;
  loc.readingEvery = 100;
  loc.current = null;
  loc.removed = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('permission problems', () => {
  it('reports blocked when denied for good, without prompting', async () => {
    loc.permission = { status: 'denied', canAskAgain: false };
    expect(await locate()).toEqual({ ok: false, problem: 'blocked' });
  });

  it('prompts when it can, and reports denied when the teacher says no', async () => {
    loc.permission = { status: 'undetermined', canAskAgain: true };
    loc.requested = { status: 'denied', canAskAgain: true };
    expect(await locate()).toEqual({ ok: false, problem: 'denied' });
  });

  it('requires Precise Location on iOS and Android', async () => {
    loc.permission = { status: 'granted', canAskAgain: true, ios: { accuracy: 'reduced' } };
    expect(await locate()).toEqual({ ok: false, problem: 'approximate' });
    loc.permission = { status: 'granted', canAskAgain: true, android: { accuracy: 'coarse' } };
    expect(await locate()).toEqual({ ok: false, problem: 'approximate' });
  });

  it('reports Location Services being off', async () => {
    loc.servicesOn = false;
    expect(await locate()).toEqual({ ok: false, problem: 'services-off' });
  });

  it('knows whether the teacher has been asked yet', async () => {
    loc.permission = { status: 'undetermined', canAskAgain: true };
    expect(await hasAskedForLocation()).toBe(false);
    loc.permission = { status: 'denied', canAskAgain: true };
    expect(await hasAskedForLocation()).toBe(true);
  });
});

describe('reading the position', () => {
  it('keeps the most accurate reading within the wait', async () => {
    loc.readings = [reading(200), reading(45), reading(80)];
    const result = await locate();
    expect(result).toEqual({
      ok: true,
      position: { latitude: 43.7, longitude: -79.7, accuracy: 45, mocked: false },
    });
  });

  it('stops early once a reading is good enough, and stops the watch', async () => {
    loc.readings = [reading(120), reading(12), reading(5)];
    const result = await locate();
    expect(result.ok && result.position.accuracy).toBe(12);
    expect(loc.removed).toBe(1);
  });

  it('stops the watch even when it only starts after the wait is over', async () => {
    // The race the review found: without the fix, GPS kept running.
    loc.watchStartsAfter = 10_000;
    loc.current = reading(30);
    const result = await locate();
    expect(result.ok && result.position.accuracy).toBe(30); // fell back to a single fix
    expect(loc.removed).toBe(1);
  });

  it('passes the mock-location mark through for the server to refuse', async () => {
    loc.readings = [reading(10, true)];
    const result = await locate();
    expect(result.ok && result.position.mocked).toBe(true);
  });

  it('falls back to a single fix, then reports unavailable', async () => {
    loc.current = reading(60);
    expect((await locate()).ok).toBe(true);
    loc.current = null;
    expect(await locate()).toEqual({ ok: false, problem: 'unavailable' });
  });
});
