import React, { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import Constants from 'expo-constants';
import { fetchAppConfig, type AppConfig } from '../services/appConfig.service';
import { isUpdateRequired, resolveStoreUrl } from '../utils/appVersion';

/**
 * Blocks builds older than config/app.minSupportedVersion in Firestore.
 *
 * The minimum lives server-side on purpose: once this ships, old builds can be
 * cut off by editing one Firestore field, with no further App Store release.
 * That is what makes a breaking data migration safe to finish — you can be
 * certain no old client is still reading the old shape.
 *
 * It fails OPEN everywhere: unreadable config, missing field, network timeout,
 * unknown app version. Being unable to reach Firestore must never brick the
 * app for everyone.
 *
 * The check runs once at startup, above AuthProvider, so an outdated build is
 * stopped before it can sign in or issue a single query.
 */
export default function VersionGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [checked, setChecked] = useState(false);

  const currentVersion = Constants.expoConfig?.version;

  useEffect(() => {
    let active = true;
    fetchAppConfig().then((remote) => {
      if (!active) return;
      setConfig(remote);
      setBlocked(isUpdateRequired(currentVersion, remote?.minSupportedVersion));
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [currentVersion]);

  // Render children while the check is in flight. A slow network should not
  // show a splash screen; if the build turns out to be too old the gate
  // appears a moment later, and the migration guarantee still holds because
  // the minimum is only raised once old builds are meant to stop working.
  if (!checked || !blocked) return <>{children}</>;

  const storeUrl = resolveStoreUrl(Platform.OS, config);

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Update required
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        {config?.updateMessage ??
          'This version of IlmTrack is no longer supported. Please update to continue.'}
      </Text>
      <Button mode="contained" style={styles.button} onPress={() => Linking.openURL(storeUrl)}>
        Update now
      </Button>
      <Text variant="bodySmall" style={styles.version}>
        Installed {currentVersion ?? 'unknown'} · requires {config?.minSupportedVersion}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  body: { color: '#666', textAlign: 'center', marginBottom: 24 },
  button: { minWidth: 200 },
  version: { color: '#999', marginTop: 24 },
});
