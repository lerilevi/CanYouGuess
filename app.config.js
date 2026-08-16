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

// ⚠️  Replace with your real AdMob App ID (not a secret — visible in Info.plist).
// Format: ca-app-pub-XXXXXXXXXXXXXXXXX~XXXXXXXXXX
const admobAppId =
  process.env.EXPO_PUBLIC_ADMOB_APP_ID &&
  !process.env.EXPO_PUBLIC_ADMOB_APP_ID.includes('placeholder')
    ? process.env.EXPO_PUBLIC_ADMOB_APP_ID
    : (() => {
        console.warn(
          '[app.config.js] WARNING: EXPO_PUBLIC_ADMOB_APP_ID is not set or is a placeholder. ' +
          'The Google Mobile Ads SDK will crash on launch in production builds. ' +
          'Set the real AdMob App ID before submitting to TestFlight/Play Store.'
        );
        // Return Google\'s official test App ID so development/test builds
        // don\'t crash. MUST be replaced with the real ID for production.
        return 'ca-app-pub-3940256099942544~1458002511'; // Google test App ID (iOS)
      })();

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
