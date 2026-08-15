/**
 * adService.web.ts
 *
 * Web stub — Metro automatically resolves this file over adService.ts on the
 * web platform, preventing the native-only react-native-google-mobile-ads
 * module from being bundled.
 */

export async function initializeAds(): Promise<void> {}

export function preloadInterstitial(): void {}

export function showInterstitial(): Promise<boolean> {
  return Promise.resolve(false);
}

export function showRewardedAd(): Promise<boolean> {
  // Simulate a brief reward in dev so the flow can be exercised in browser
  if (__DEV__) {
    return new Promise((resolve) => setTimeout(() => resolve(true), 1000));
  }
  return Promise.resolve(false);
}
