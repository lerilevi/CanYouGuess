/**
 * adService.ts
 *
 * Real AdMob integration using react-native-google-mobile-ads.
 * The web stub (adService.web.ts) is automatically picked by Metro on the web
 * platform, so this file is only ever bundled for iOS/Android.
 *
 * All native imports are done lazily at call-time (not at module parse-time)
 * so the file can be safely bundled in Live Preview without crashing.
 */

import { Platform } from 'react-native';

// ─── Lazy native module access ────────────────────────────────────────────────

function getNativeAds() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}

// ─── Ad Unit IDs ─────────────────────────────────────────────────────────────

function getRewardedUnitId(): string {
  const mod = getNativeAds();
  const testId = mod?.TestIds?.REWARDED ?? 'ca-app-pub-3940256099942544/5224354917';
  return __DEV__
    ? testId
    : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? testId);
}

function getInterstitialUnitId(): string {
  const mod = getNativeAds();
  const testId = mod?.TestIds?.INTERSTITIAL ?? 'ca-app-pub-3940256099942544/4411468910';
  return __DEV__
    ? testId
    : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? testId);
}

// ─── ATT permission (iOS 14+) ─────────────────────────────────────────────────

async function requestTrackingPermission(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const { requestTrackingPermissionsAsync } = await import(
      'expo-tracking-transparency'
    );
    await requestTrackingPermissionsAsync();
  } catch {
    // Module not installed or not a native build — safe to ignore in preview
  }
}

// ─── SDK initialisation ───────────────────────────────────────────────────────

let adsInitialized = false;

export async function initializeAds(): Promise<void> {
  if (adsInitialized) return;

  const mod = getNativeAds();
  if (!mod) {
    // Native module unavailable (Live Preview / web) — skip silently
    return;
  }

  await requestTrackingPermission();

  try {
    await mod.default().initialize();
    adsInitialized = true;
    preloadInterstitial();
  } catch (err) {
    console.warn('[adService] Failed to initialize Mobile Ads SDK:', err);
  }
}

// ─── Interstitial ─────────────────────────────────────────────────────────────

let interstitialAd: unknown = null;
let interstitialLoaded = false;

export function preloadInterstitial(): void {
  const mod = getNativeAds();
  if (!mod) return;

  try {
    const ad = mod.InterstitialAd.createForAdRequest(getInterstitialUnitId(), {
      requestNonPersonalizedAdsOnly: false,
    });

    ad.addAdEventListener(mod.AdEventType.LOADED, () => {
      interstitialLoaded = true;
    });
    ad.addAdEventListener(mod.AdEventType.ERROR, () => {
      interstitialLoaded = false;
    });
    ad.addAdEventListener(mod.AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      setTimeout(preloadInterstitial, 3000);
    });

    ad.load();
    interstitialAd = ad;
  } catch (err) {
    console.warn('[adService] preloadInterstitial error:', err);
  }
}

export function showInterstitial(): Promise<boolean> {
  return new Promise((resolve) => {
    const mod = getNativeAds();
    if (!mod || !interstitialAd || !interstitialLoaded) {
      resolve(false);
      return;
    }
    try {
      const ad = interstitialAd as InstanceType<typeof mod.InterstitialAd>;
      ad.addAdEventListener(mod.AdEventType.CLOSED, () => resolve(true));
      ad.addAdEventListener(mod.AdEventType.ERROR, () => resolve(false));
      ad.show();
    } catch (err) {
      console.warn('[adService] showInterstitial error:', err);
      resolve(false);
    }
  });
}

// ─── UMP Privacy Options Form ───────────────────────────────────────────────────

/**
 * Shows the Google UMP privacy options form so the user can review or change
 * their ad consent choices at any time.
 * Only available after the SDK has been initialised and UMP has collected
 * consent — the form may not be available in all regions.
 */
export async function showPrivacyOptionsForm(): Promise<{ error?: string }> {
  const mod = getNativeAds();
  if (!mod) {
    return { error: 'Ad preferences are not available in this environment.' };
  }
  try {
    await mod.AdsConsent.showPrivacyOptionsForm();
    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[adService] showPrivacyOptionsForm error:', message);
    return { error: message ?? 'Could not open privacy options.' };
  }
}

// ─── Rewarded ─────────────────────────────────────────────────────────────────

export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const mod = getNativeAds();
    if (!mod) {
      // Simulate reward in dev/preview so the flow can be tested
      if (__DEV__) {
        setTimeout(() => resolve(true), 1000);
      } else {
        resolve(false);
      }
      return;
    }

    let rewarded = false;

    try {
      const ad = mod.RewardedAd.createForAdRequest(getRewardedUnitId(), {
        requestNonPersonalizedAdsOnly: false,
      });

      ad.addAdEventListener(mod.RewardedAdEventType.EARNED_REWARD, () => {
        rewarded = true;
      });
      ad.addAdEventListener(mod.AdEventType.CLOSED, () => {
        resolve(rewarded);
      });
      ad.addAdEventListener(mod.AdEventType.ERROR, (err: unknown) => {
        console.warn('[adService] Rewarded ad error:', err);
        resolve(false);
      });
      ad.addAdEventListener(mod.RewardedAdEventType.LOADED, () => {
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
