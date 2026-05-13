import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthErrorMessage } from '../src/utils/authErrors';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getAuthErrorMessage', () => {
  const cases: Array<[string, RegExp]> = [
    ['auth/user-not-found', /No account found/i],
    ['auth/wrong-password', /Incorrect password/i],
    ['auth/invalid-credential', /Invalid email or password/i],
    ['auth/invalid-email', /valid email/i],
    ['auth/user-disabled', /disabled/i],
    ['auth/too-many-requests', /Too many failed attempts/i],
    ['auth/email-already-in-use', /already exists/i],
    ['auth/weak-password', /too weak/i],
    ['auth/operation-not-allowed', /disabled/i],
    ['auth/expired-action-code', /expired/i],
    ['auth/invalid-action-code', /invalid/i],
    ['auth/network-request-failed', /Network error/i],
    ['auth/requires-recent-login', /sign out and sign in/i],
    ['auth/internal-error', /unexpected error/i],
  ];

  for (const [code, pattern] of cases) {
    it(`maps ${code} to a user-friendly message`, () => {
      expect(getAuthErrorMessage({ code })).toMatch(pattern);
    });
  }

  it('falls back to a generic message for unknown codes', () => {
    expect(getAuthErrorMessage({ code: 'auth/banana' })).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('passes through non-Firebase error messages on unknown codes', () => {
    expect(getAuthErrorMessage({ code: 'auth/banana', message: 'Pineapple issue' })).toBe(
      'Pineapple issue'
    );
  });

  it('suppresses messages containing the word "Firebase"', () => {
    expect(
      getAuthErrorMessage({ code: 'auth/banana', message: 'Firebase: something internal' })
    ).toBe('Something went wrong. Please try again.');
  });

  it('handles missing code/message gracefully', () => {
    expect(getAuthErrorMessage({})).toBe('Something went wrong. Please try again.');
  });
});
