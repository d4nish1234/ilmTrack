import { initializeApp, getApps, FirebaseApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Firebase is auto-initialized by @react-native-firebase when using native modules
// The configuration comes from google-services.json (Android) and GoogleService-Info.plist (iOS)

let app: FirebaseApp;

if (getApps().length === 0) {
  // Firebase initializes automatically from native config files
  // This is just a fallback check
  app = initializeApp({});
} else {
  app = getApps()[0];
}

export { auth, firestore };
export default app;
