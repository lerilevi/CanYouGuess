/**
 * adService.ts
 *
 * Real AdMob integration using react-native-google-mobile-ads.
 * The web stub (adService.web.ts) is automatically picked by Metro on the web
 * platform, so this file is only ever bundled for iOS/Android.
 *
 * Flow:
 *  1. initializeAds() — call once on app start; requests ATT on iOS first,
 *     then initializes the Mobile Ads SDK.
 *  2. preloadInterstitial() — loads an interstitial in the background.
 *  3. showInterstitial()   — shows the pre-loaded interstitial (fire-and-forget).
 *  4. showRewardedAd()     — loads + shows a rewarded ad; resolves true only when
 *     the user earns the reward (watched the full ad).
 */

import MobileAds, {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { Platform, PermissionsAndroid } from 'react-native';

// ─── Ad Unit IDs ─────────────────────────────────────────────────────────────

const REWARDED_UNIT_ID: string = __DEV__
  ? TestIds.REWARDED
  : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? TestIds.REWARDED);

// Using a generic test interstitial ID for now; swap in a real unit ID when
// you create an interstitial ad unit in AdMob.
const INTERSTITIAL_UNIT_ID: string = __DEV__
  ? TestIds.INTERSTITIAL
  : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? TestIds.INTERSTITIAL);

// ─── ATT permission (iOS 14+) ─────────────────────────────────────────────────

async function requestTrackingPermission(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // expo-tracking-transparency is the standard Expo wrapper for ATT
    const { requestTrackingPermissionsAsync } = await import(
      'expo-tracking-transparency'
    );
    await requestTrackingPermissionsAsync();
  } catch (err) {
    // Module not installed or not a native build — safe to ignore in preview
    console.warn('[adService] ATT permission request unavailable:', err);
  }
}

// ─── SDK initialisation ───────────────────────────────────────────────────────

let adsInitialized = false;

export async function initializeAds(): Promise<void> {
  if (adsInitialized) return;

  // iOS: request ATT first so the SDK can use the IDFA
  await requestTrackingPermission();

  try {
    await MobileAds().initialize();
    adsInitialized = true;
    console.log('[adService] Mobile Ads SDK initialized');
    // Pre-load the first interstitial straight away
    preloadInterstitial();
  } catch (err) {
    console.error('[adService] Failed to initialize Mobile Ads SDK:', err);
  }
}

// ─── Interstitial ─────────────────────────────────────────────────────────────

let interstitialAd: InterstitialAd | null = null;
let interstitialLoaded = false;

export function preloadInterstitial(): void {
  try {
    interstitialAd = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID, {
      requestNonPersonalizedAdsOnly: false,
    });

    interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
    });

    interstitialAd.addAdEventListener(AdEventType.ERROR, (err) => {
      console.warn('[adService] Interstitial failed to load:', err);
      interstitialLoaded = false;
    });

    interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      // Pre-load the next one after a short delay
      setTimeout(preloadInterstitial, 3000);
    });

    interstitialAd.load();
  } catch (err) {
    console.warn('[adService] preloadInterstitial error:', err);
  }
}

export function showInterstitial(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!interstitialAd || !interstitialLoaded) {
      resolve(false);
      return;
    }
    try {
      interstitialAd.addAdEventListener(AdEventType.CLOSED, () => resolve(true));
      interstitialAd.addAdEventListener(AdEventType.ERROR, () => resolve(false));
      interstitialAd.show();
    } catch (err) {
      console.warn('[adService] showInterstitial error:', err);
      resolve(false);
    }
  });
}

// ─── Rewarded ─────────────────────────────────────────────────────────────────

export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    let rewarded = false;

    try {
      const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });

      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        rewarded = true;
      });

      ad.addAdEventListener(AdEventType.CLOSED, () => {
        resolve(rewarded);
      });

      ad.addAdEventListener(AdEventType.ERROR, (err) => {
        console.warn('[adService] Rewarded ad error:', err);
        resolve(false);
      });

      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        try {
          ad.show();
        } catch (showErr) {
          console.warn('[adService] Rewarded ad show error:', showErr);
          resolve(false);
        }
      });

      ad.load();
    } catch (err) {
      console.warn('[adService] showRewardedAd error:', err);
      resolve(false);
    }
  });
}
