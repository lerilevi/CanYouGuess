/**
 * purchasesService.ts
 *
 * Real RevenueCat integration via react-native-purchases.
 *
 * IMPORTANT: All imports from 'react-native-purchases' are done lazily via
 * require() inside each function — never at module parse time. A static
 * top-level import of a native module (like RevenueCat) causes the iOS SDK
 * to be loaded during JS bundle evaluation on a background queue, which can
 * throw an NSException and crash the app before any UI renders.
 *
 * The web platform uses purchasesService.web.ts (Metro platform extension).
 */

import { APP_CONFIG } from '@/constants/config';

// ─── Lazy native module access ────────────────────────────────────────────────

type PurchasesModule = typeof import('react-native-purchases');

function getNativePurchases(): PurchasesModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases') as PurchasesModule;
  } catch {
    return null;
  }
}

// ─── Initialisation ──────────────────────────────────────────────────────────

let _initialized = false;

export const initializePurchases = async (): Promise<void> => {
  if (_initialized) return;
  const mod = getNativePurchases();
  if (!mod) {
    console.warn('[Purchases] react-native-purchases native module not available.');
    return;
  }
  try {
    const apiKey = APP_CONFIG.revenueCatKey;
    if (!apiKey) {
      console.warn('[Purchases] EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY is not set.');
      return;
    }
    mod.default.setLogLevel(mod.LOG_LEVEL.ERROR);
    await mod.default.configure({ apiKey });
    _initialized = true;
  } catch (err) {
    console.error('[Purchases] initializePurchases failed:', err);
  }
};

// ─── Identity ────────────────────────────────────────────────────────────────

export const loginPurchasesUser = async (userId: string): Promise<void> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return;
    await mod.default.logIn(userId);
  } catch (err) {
    console.error('[Purchases] loginPurchasesUser failed:', err);
  }
};

export const logoutPurchasesUser = async (): Promise<void> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return;
    await mod.default.logOut();
  } catch (err) {
    console.error('[Purchases] logoutPurchasesUser failed:', err);
  }
};

// ─── Customer info ───────────────────────────────────────────────────────────

export const getCustomerInfo = async (): Promise<import('react-native-purchases').CustomerInfo | null> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return null;
    return await mod.default.getCustomerInfo();
  } catch (err) {
    console.error('[Purchases] getCustomerInfo failed:', err);
    return null;
  }
};

export const checkIsSubscribed = async (): Promise<boolean> => {
  try {
    const info = await getCustomerInfo();
    if (!info) return false;
    const entitlement = info.entitlements.active[APP_CONFIG.premiumEntitlementId];
    return !!entitlement;
  } catch {
    return false;
  }
};

// ─── Offerings ───────────────────────────────────────────────────────────────

export const getOfferings = async (): Promise<{
  current: { availablePackages: import('react-native-purchases').PurchasesPackage[] };
} | null> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return null;
    const offerings = await mod.default.getOfferings();
    if (!offerings.current) return null;
    return { current: { availablePackages: offerings.current.availablePackages } };
  } catch (err) {
    console.error('[Purchases] getOfferings failed:', err);
    return null;
  }
};

// ─── Purchase ────────────────────────────────────────────────────────────────

export const purchasePackage = async (
  packageToPurchase: unknown
): Promise<{ success: boolean; error?: string }> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return { success: false, error: 'Purchases not initialized' };
    const { customerInfo } = await mod.default.purchasePackage(
      packageToPurchase as import('react-native-purchases').PurchasesPackage
    );
    const active = customerInfo.entitlements.active[APP_CONFIG.premiumEntitlementId];
    if (active) {
      return { success: true };
    }
    return { success: false, error: 'Purchase completed but entitlement not found.' };
  } catch (err: unknown) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e.userCancelled) return { success: false, error: 'cancelled' };
    return { success: false, error: e.message ?? 'Purchase failed' };
  }
};

// ─── Restore ─────────────────────────────────────────────────────────────────

export const restorePurchases = async (): Promise<{
  success: boolean;
  isSubscribed: boolean;
  error?: string;
}> => {
  const mod = getNativePurchases();
  try {
    if (!_initialized || !mod) return { success: false, isSubscribed: false, error: 'Purchases not initialized' };
    const customerInfo = await mod.default.restorePurchases();
    const active = customerInfo.entitlements.active[APP_CONFIG.premiumEntitlementId];
    return { success: true, isSubscribed: !!active };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, isSubscribed: false, error: e.message ?? 'Restore failed' };
  }
};
