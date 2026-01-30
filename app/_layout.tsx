import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { LoadingSpinner, KeyboardAccessory } from '../src/components/common';
import {
  setupNotificationChannel,
  addNotificationListeners,
} from '../src/services/notification.service';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1a73e8',
    secondary: '#5f6368',
  },
};

function RootLayoutNav() {
  const { user, loading, emailVerified, registerPushNotifications } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notificationsRegistered = useRef(false);

  // Set up notification channel and listeners
  useEffect(() => {
    setupNotificationChannel();

    const cleanup = addNotificationListeners(
      (notification) => {
        console.log('Notification received:', notification);
      },
      (response) => {
        console.log('Notification tapped:', response);
        // Navigate based on notification data if needed
        const data = response.notification.request.content.data;
        if (data?.type === 'homework' && data?.studentId) {
          // Could navigate to homework screen
        }
      }
    );

    return cleanup;
  }, []);

  // Register for push notifications when user is verified
  useEffect(() => {
    if (user && emailVerified && !notificationsRegistered.current) {
      notificationsRegistered.current = true;
      registerPushNotifications();
    }
    if (!user) {
      notificationsRegistered.current = false;
    }
  }, [user, emailVerified, registerPushNotifications]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTeacherGroup = segments[0] === '(teacher)';
    const inParentGroup = segments[0] === '(parent)';
    const onVerifyPage = segments[1] === 'verify-email';

    if (!user && !inAuthGroup) {
      // User is not signed in, redirect to login
      router.replace('/(auth)/login');
    } else if (user) {
      // Check if email is verified
      if (!emailVerified) {
        // User needs to verify email
        if (!onVerifyPage) {
          router.replace('/(auth)/verify-email');
        }
      } else if (inAuthGroup) {
        // Email is verified, redirect from auth pages to appropriate home
        if (user.role === 'teacher') {
          router.replace('/(teacher)');
        } else {
          router.replace('/(parent)');
        }
      } else if (user.role === 'teacher' && inParentGroup) {
        // Teacher trying to access parent routes
        router.replace('/(teacher)');
      } else if (user.role === 'parent' && inTeacherGroup) {
        // Parent trying to access teacher routes
        router.replace('/(parent)');
      }
    }
  }, [user, loading, emailVerified, segments]);

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(teacher)" />
      <Stack.Screen name="(parent)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
      {/* iOS keyboard accessory with "Done" button */}
      <KeyboardAccessory />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
