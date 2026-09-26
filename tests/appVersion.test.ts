/**
 * The minimum-supported-version gate.
 *
 * The bias throughout is fail-open: a bad or unreadable minimum must let users
 * in. Locking every install out of the app is a far worse outcome than
 * briefly serving a build that should have been retired.
 */
import { describe, expect, it } from 'vitest';
import { compareVersions, isUpdateRequired, resolveStoreUrl } from '../src/utils/appVersion';

describe('compareVersions', () => {
  it('orders by numeric segment, not string', () => {
    expect(compareVersions('1.10', '1.9')).toBe(1); // would be -1 lexically
    expect(compareVersions('2.0', '10.0')).toBe(-1);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
    expect(compareVersions('1.3', '1.3.1')).toBe(-1);
    expect(compareVersions('1.3.0.0', '1.3')).toBe(0);
  });

  it('handles the app’s current shorthand version', () => {
    expect(compareVersions('1.3', '1.4')).toBe(-1);
    expect(compareVersions('1.4', '1.3')).toBe(1);
    expect(compareVersions('1.3', '1.3')).toBe(0);
  });

  it('ignores pre-release suffixes', () => {
    expect(compareVersions('1.4.0-beta.2', '1.4.0')).toBe(0);
  });

  it('tolerates whitespace and junk segments', () => {
    expect(compareVersions(' 1.3 ', '1.3')).toBe(0);
    expect(compareVersions('1.x', '1.0')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('blocks a build below the minimum', () => {
    expect(isUpdateRequired('1.3', '1.4')).toBe(true);
    expect(isUpdateRequired('1.3.9', '1.4.0')).toBe(true);
  });

  it('allows a build at or above the minimum', () => {
    expect(isUpdateRequired('1.4', '1.4')).toBe(false);
    expect(isUpdateRequired('2.0', '1.4')).toBe(false);
  });

  // ── Fail-open cases: every one of these must let the user through ──
  it('allows when no minimum is configured', () => {
    expect(isUpdateRequired('1.3', undefined)).toBe(false);
    expect(isUpdateRequired('1.3', null)).toBe(false);
    expect(isUpdateRequired('1.3', '')).toBe(false);
  });

  it('allows when the running version is unknown', () => {
    expect(isUpdateRequired(undefined, '9.9')).toBe(false);
    expect(isUpdateRequired('', '9.9')).toBe(false);
  });

  it('allows when either value is not a version at all', () => {
    // A fat-fingered Firestore edit must not brick every install.
    expect(isUpdateRequired('1.3', 'latest')).toBe(false);
    expect(isUpdateRequired('1.3', 'v1.4')).toBe(false);
    expect(isUpdateRequired('unknown', '1.4')).toBe(false);
  });

  it('blocks only the builds below, across a realistic rollout', () => {
    const min = '1.4';
    expect(['1.2', '1.3', '1.3.9'].every((v) => isUpdateRequired(v, min))).toBe(true);
    expect(['1.4', '1.4.1', '1.5', '2.0'].some((v) => isUpdateRequired(v, min))).toBe(false);
  });
});

describe('resolveStoreUrl', () => {
  it('prefers the configured URL per platform', () => {
    const config = { iosStoreUrl: 'https://ios.example', androidStoreUrl: 'https://play.example' };
    expect(resolveStoreUrl('ios', config)).toBe('https://ios.example');
    expect(resolveStoreUrl('android', config)).toBe('https://play.example');
  });

  it('always returns something — a blocked user needs a working button', () => {
    for (const platform of ['ios', 'android', 'web']) {
      for (const config of [null, undefined, {}, { iosStoreUrl: '', androidStoreUrl: '   ' }]) {
        expect(resolveStoreUrl(platform, config)).toMatch(/^https:\/\//);
      }
    }
  });
});
