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
const admobAppId = 'ca-app-pub-1234939432505573~9931354547';

module.exports = {
  expo: {
    name: 'onspace-app',
    slug: 'onspace-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo.png',
    scheme: 'onspaceapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.canyouguess.app',
    },
    android: {
      package: 'com.canyouguess.app',
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
  },
};
