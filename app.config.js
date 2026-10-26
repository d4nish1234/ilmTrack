module.exports = {
  expo: {
    name: 'ilmTrack',
    slug: 'ilmtrack',
    version: '1.7',
    orientation: 'portrait',
    scheme: 'ilmtrack',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    splash: {
      backgroundColor: '#1a73e8',
    },
    ios: {
      icon: './assets/icon.png',
      supportsTablet: true,
      bundleIdentifier: 'com.danishmahboob.ilmtrack',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#1a73e8',
      },
      package: 'com.danishmahboob.ilmtrack',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
    web: {
      bundler: 'metro',
      output: 'static',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/icon.png',
          backgroundColor: '#1a73e8',
          imageWidth: 200,
        },
      ],
      'expo-asset',
      [
        'expo-notifications',
        {
          sounds: [],
        },
      ],
      [
        // Foreground ("while using") only: location is checked when a teacher
        // starts a shift and when an admin pins a location. No background
        // location, so no ACCESS_BACKGROUND_LOCATION and no store declaration
        // for it. The plugin writes all three iOS strings regardless; they are
        // set to the same honest text so none says more than we do.
        'expo-location',
        {
          locationWhenInUsePermission:
            'ilmTrack checks that you are at your school when you start a shift.',
          locationAlwaysPermission:
            'ilmTrack checks that you are at your school when you start a shift.',
          locationAlwaysAndWhenInUsePermission:
            'ilmTrack checks that you are at your school when you start a shift.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      '@react-native-community/datetimepicker',
      'expo-font',
      'expo-sharing',
      'expo-status-bar',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: 'fb8be349-09a5-41e1-87ea-168a77ad6191',
      },
    },
    owner: 'd4nish1234',
  },
};
