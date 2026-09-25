/**
 * app.config.js
 *
 * Dynamic Expo config. All plugins are declared here (not in app.json) to
 * avoid duplication. app.json is kept minimal (identity fields only).
 *
 * IMPORTANT — AdMob App ID:
 * The GADApplicationIdentifier must be embedded in the native Info.plist at
 * build time by the react-native-google-mobile-ads config plugin. It cannot
 * be read from a runtime environment variable during native builds.
 * The App ID is NOT a secret (it ships in every binary's Info.plist).
 * Replace the value below with your real AdMob App ID before building.
 */

// AdMob App ID — hard-coded (not a secret; ships in every binary's Info.plist).
// Commented out for isolation test build (Option A).
 const admobAppId = 'ca-app-pub-1234939432505573~9931354547';

module.exports = {
  expo: {
    name: 'Can You Guess?',
    slug: 'onspace-app',
    version: '1.0.7',
    orientation: 'portrait',
    icon: './assets/images/logo.png',
    scheme: 'onspaceapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.onspace.canyouguess',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'Can You Guess? may access your camera when you choose to take a photo.',
        NSContactsUsageDescription:
          'Can You Guess? may access your contacts when you choose to connect with friends.',
      },
    },
    android: {
      package: 'app.onspace.canyouguess',
      adaptiveIcon: {
        foregroundImage: './assets/images/logo.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/logo.png',
    },
    plugins: [
      'expo-router',
      './plugins/withFmtXcode26Fix',
      './plugins/withNativeFatalReporter',
       [
         'react-native-google-mobile-ads',
         {
           androidAppId: admobAppId,
           iosAppId: admobAppId,
           userTrackingUsageDescription:
             'This identifier will be used to deliver personalized ads to you.',
           skAdNetworkItems: [],
         },
       ],
       'expo-tracking-transparency',
      [
        'expo-splash-screen',
        {
          image: './assets/images/logo.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: '211168a1-26fe-4ac8-ac0e-c4595e7e2ff7',
      },
    },
  },
};
