/**
 * app.config.js
 *
 * Dynamic Expo config — reads environment variables at build time so sensitive
 * IDs (AdMob App ID) don't have to be hard-coded in the static app.json.
 *
 * The static app.json is still used for non-dynamic fields; this file extends it.
 */

const admobAppId =
  process.env.EXPO_PUBLIC_ADMOB_APP_ID ?? 'ca-app-pub-placeholder~0000000000';

module.exports = {
  expo: {
    name: 'onspace-app',
    slug: 'onspace-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo.png',
    scheme: 'onspaceapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
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
