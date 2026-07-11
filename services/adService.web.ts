/**
 * adService.web.ts
 *
 * Web stub for react-native-google-mobile-ads.
 * Metro automatically picks this file over adService.ts on the web platform,
 * preventing the native-only module from being bundled.
 */

export async function initializeAds(): Promise<void> {}

export function preloadInterstitial(): void {}

export function showInterstitial(): Promise<boolean> {
  return Promise.resolve(false);
}

export function showRewardedAd(): Promise<boolean> {
  // Simulate a reward in dev so the flow can be tested on web
  if (__DEV__) {
    return new Promise((resolve) => setTimeout(() => resolve(true), 1000));
  }
  return Promise.resolve(false);
}
