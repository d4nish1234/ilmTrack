/**
 * Remote app configuration: config/app in Firestore.
 *
 * Deliberately readable without signing in (see firestore.rules) so the
 * version gate can run before authentication — an outdated build must be
 * stopped at the login screen, not after it.
 *
 * Holds no user data. Only the minimum supported version and the store links.
 */
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

export interface AppConfig {
  /** Builds older than this are blocked. Omit or leave blank to block nobody. */
  minSupportedVersion?: string;
  /** Optional override of the message shown on the blocking screen. */
  updateMessage?: string;
  iosStoreUrl?: string;
  androidStoreUrl?: string;
}

/** How long to wait before giving up and letting the user through. */
const TIMEOUT_MS = 5000;

/**
 * Returns null when the config cannot be read, which callers must treat as
 * "no restriction". Never throws.
 */
export async function fetchAppConfig(): Promise<AppConfig | null> {
  try {
    const result = await Promise.race([
      getDoc(doc(firestore, 'config', 'app')),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    if (!result || !('exists' in result) || !result.exists()) return null;
    return result.data() as AppConfig;
  } catch (error) {
    // Offline, rules, anything — fail open.
    console.warn('Could not read app config; skipping version check.', error);
    return null;
  }
}
