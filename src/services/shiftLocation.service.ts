/**
 * The teacher's position for starting, resuming or ending a shift.
 *
 * Foreground ("while using") permission only, and Precise Location is
 * required: an approximate position can be kilometres off, which would make
 * the server's check meaningless. A fuzzy reading with precise permission on
 * (indoors, a basement) is fine; the server lets it through, flagged.
 */
import * as Location from 'expo-location';

export interface ShiftPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  mocked: boolean;
}

export type PositionProblem =
  /** Never asked, or asked and can be asked again: the system prompt will show. */
  | 'denied'
  /** Denied for good: only Settings can change it. */
  | 'blocked'
  /** Only approximate location allowed. */
  | 'approximate'
  /** Location Services are off for the whole phone. */
  | 'services-off'
  /** Permission is fine but no position came back. */
  | 'unavailable';

export type PositionResult = { ok: true; position: ShiftPosition } | { ok: false; problem: PositionProblem };

export const POSITION_PROBLEM_MESSAGES: Record<PositionProblem, string> = {
  denied: 'ilmTrack needs your location to start a shift.',
  blocked: 'Location is off for ilmTrack. Turn it on in Settings to start a shift.',
  approximate: 'Turn on Precise Location for ilmTrack in Settings to start a shift.',
  'services-off': 'Turn on Location Services for your phone to start a shift.',
  unavailable: "Couldn't get your location. Step outside or near a window, then try again.",
};

/** Problems the teacher fixes in the phone's Settings rather than in the app. */
export const NEEDS_SETTINGS: PositionProblem[] = ['blocked', 'approximate', 'services-off'];

const GOOD_ENOUGH_M = 30;
const MAX_WAIT_MS = 6000;

function isApproximate(permission: Location.LocationPermissionResponse): boolean {
  return permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse';
}

/**
 * The best reading within a few seconds: GPS often starts rough and settles,
 * so keep the most accurate one, stopping early once it is good.
 */
async function bestReading(): Promise<Location.LocationObject | null> {
  let best: Location.LocationObject | null = null;
  let subscription: Location.LocationSubscription | null = null;
  let finished = false;

  await new Promise<void>((resolve) => {
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, MAX_WAIT_MS);
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
      (reading) => {
        if (finished) return;
        if (!best || (reading.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) {
          best = reading;
        }
        if ((reading.coords.accuracy ?? Infinity) <= GOOD_ENOUGH_M) finish();
      }
    )
      .then((s) => {
        subscription = s;
        // The watch can start only after the wait is over. Stop it now, or GPS
        // keeps running in the background until the app restarts.
        if (finished) s.remove();
      })
      .catch(finish);
  });
  // Started in time: stop it here. (If it starts later, the .then above does.)
  (subscription as Location.LocationSubscription | null)?.remove();

  if (best) return best;
  try {
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  } catch {
    return null;
  }
}

/** Ask for permission if needed, then read the position. */
export async function getShiftPosition(): Promise<PositionResult> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    if (!permission.canAskAgain) return { ok: false, problem: 'blocked' };
    permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { ok: false, problem: permission.canAskAgain ? 'denied' : 'blocked' };
    }
  }
  if (isApproximate(permission)) return { ok: false, problem: 'approximate' };
  if (!(await Location.hasServicesEnabledAsync())) return { ok: false, problem: 'services-off' };

  const reading = await bestReading();
  if (!reading) return { ok: false, problem: 'unavailable' };
  return {
    ok: true,
    position: {
      latitude: reading.coords.latitude,
      longitude: reading.coords.longitude,
      accuracy: reading.coords.accuracy ?? 0,
      mocked: reading.mocked === true,
    },
  };
}

/** Whether permission has been decided yet, to show the explanation first. */
export async function hasAskedForLocation(): Promise<boolean> {
  const permission = await Location.getForegroundPermissionsAsync();
  return permission.status !== 'undetermined';
}
