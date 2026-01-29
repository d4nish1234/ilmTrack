import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { LoadingSpinner, KeyboardAccessory } from '../src/components/common';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1a73e8',
    secondary: '#5f6368',
  },
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTeacherGroup = segments[0] === '(teacher)';
    const inParentGroup = segments[0] === '(parent)';

    if (!user && !inAuthGroup) {
      // User is not signed in, redirect to login
      router.replace('/(auth)/login');
    } else if (user) {
      // User is signed in
      if (inAuthGroup) {
        // Redirect from auth pages to appropriate home
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
  }, [user, loading, segments]);

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
