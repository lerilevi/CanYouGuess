/**
 * adService.ts
 *
 * Ad service that works in ALL environments (Expo Go, OnSpace preview, web).
 *
 * In development / preview builds: ads are simulated with a short delay so the
 * full rewarded-ad flow (watch → earn bonus question) can be tested without a
 * native binary.
 *
 * In a real production native build you would swap the `simulate*` calls below
 * with actual react-native-google-mobile-ads SDK calls. The web stub
 * (adService.web.ts) handles the web platform automatically via Metro.
 *
 * NOTE: react-native-google-mobile-ads is intentionally NOT imported here.
 * The package cannot be bundled for web (it uses native-only modules), and it
 * requires native build config (AdMob App IDs in AndroidManifest / Info.plist)
 * that isn't available in preview environments.
 */

let adsInitialized = false;

export async function initializeAds(): Promise<void> {
  if (adsInitialized) return;
  adsInitialized = true;
  // Real SDK init goes here for production native builds
}

// ─── Interstitial ──────────────────────────────────────────────────────────

export function preloadInterstitial(): void {
  // No-op in preview — real SDK preload goes here for production builds
}

export function showInterstitial(): Promise<boolean> {
  // Simulate a brief ad delay; silently resolves so it never blocks gameplay
  return new Promise((resolve) => setTimeout(() => resolve(true), 800));
}

// ─── Rewarded ──────────────────────────────────────────────────────────────

export function showRewardedAd(): Promise<boolean> {
  // In dev/preview: always reward after a simulated 1.5 s "ad watch"
  // In production native builds: replace with real SDK call
  return new Promise((resolve) => setTimeout(() => resolve(true), 1500));
}
