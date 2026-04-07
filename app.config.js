module.exports = {
  expo: {
    name: 'ilmTrack',
    slug: 'ilmtrack',
    version: '1.0.1',
    orientation: 'portrait',
    scheme: 'ilmtrack',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    icon: './assets/icon.png',
    splash: {
      backgroundColor: '#1a73e8',
    },
    ios: {
      icon: './assets/icon.png',
      supportsTablet: true,
      bundleIdentifier: 'com.danishmahboob.ilmtrack',
      buildNumber: '3',
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
