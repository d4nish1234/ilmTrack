/**
 * Version comparison for the minimum-supported-version gate.
 *
 * Pure and dependency-free so it can be unit tested without Firebase or a
 * running app. Handles the app's own shorthand versions ('1.3') alongside
 * full semver ('1.3.1'), treating missing segments as zero — so '1.3' and
 * '1.3.0' are the same version.
 */

/** -1 if a < b, 0 if equal, 1 if a > b. Ignores any pre-release suffix. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .trim()
      .split('-')[0] // drop '-beta.1' and friends
      .split('.')
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/**
 * Should this build be blocked?
 *
 * Fails OPEN on anything unexpected — a missing minimum, an unreadable current
 * version, junk input. Locking every user out of the app because a config read
 * returned something odd would be far worse than briefly serving an old build.
 */
export function isUpdateRequired(
  currentVersion: string | undefined | null,
  minSupportedVersion: string | undefined | null
): boolean {
  if (!currentVersion || !minSupportedVersion) return false;
  if (!/^\d/.test(String(currentVersion).trim())) return false;
  if (!/^\d/.test(String(minSupportedVersion).trim())) return false;
  return compareVersions(currentVersion, minSupportedVersion) < 0;
}

/**
 * Which store to send a blocked user to.
 *
 * Falls back to hard-coded store URLs when the remote config omits them, so a
 * blocked user always has somewhere to go — a blocking screen with a dead
 * button would be the worst possible outcome.
 */
export function resolveStoreUrl(
  platform: 'ios' | 'android' | string,
  config?: { iosStoreUrl?: string; androidStoreUrl?: string } | null
): string {
  const fallbackIos = 'https://apps.apple.com/us/app/ilmtrack/id6758573901';
  const fallbackAndroid =
    'https://play.google.com/store/apps/details?id=com.danishmahboob.ilmtrack';

  if (platform === 'ios') return config?.iosStoreUrl?.trim() || fallbackIos;
  return config?.androidStoreUrl?.trim() || fallbackAndroid;
}
