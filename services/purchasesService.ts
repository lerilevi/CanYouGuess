/**
 * purchasesService.ts
 *
 * Real RevenueCat integration via react-native-purchases.
 * API key is read from EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY.
 * The web platform uses purchasesService.web.ts (Metro platform extension).
 */

import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases';
import { APP_CONFIG } from '@/constants/config';

// ─── Initialisation ──────────────────────────────────────────────────────────

let _initialized = false;

export const initializePurchases = async (userId?: string): Promise<void> => {
  if (_initialized) return;
  try {
    const apiKey = APP_CONFIG.revenueCatKey;
    if (!apiKey) {
      console.warn('[Purchases] EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY is not set.');
      return;
    }
    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    await Purchases.configure({ apiKey });
    if (userId) {
      await Purchases.logIn(userId);
    }
    _initialized = true;
  } catch (err) {
    console.error('[Purchases] initializePurchases failed:', err);
  }
};

// ─── Identity ────────────────────────────────────────────────────────────────

export const loginPurchasesUser = async (userId: string): Promise<void> => {
  try {
    if (!_initialized) return;
    await Purchases.logIn(userId);
  } catch (err) {
    console.error('[Purchases] loginPurchasesUser failed:', err);
  }
};

export const logoutPurchasesUser = async (): Promise<void> => {
  try {
    if (!_initialized) return;
    await Purchases.logOut();
  } catch (err) {
    console.error('[Purchases] logoutPurchasesUser failed:', err);
  }
};

// ─── Customer info ───────────────────────────────────────────────────────────

export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    if (!_initialized) return null;
    return await Purchases.getCustomerInfo();
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
  current: { availablePackages: PurchasesPackage[] };
} | null> => {
  try {
    if (!_initialized) return null;
    const offerings = await Purchases.getOfferings();
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
  try {
    if (!_initialized) return { success: false, error: 'Purchases not initialized' };
    const { customerInfo } = await Purchases.purchasePackage(
      packageToPurchase as PurchasesPackage
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
  try {
    if (!_initialized) return { success: false, isSubscribed: false, error: 'Purchases not initialized' };
    const customerInfo = await Purchases.restorePurchases();
    const active = customerInfo.entitlements.active[APP_CONFIG.premiumEntitlementId];
    return { success: true, isSubscribed: !!active };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, isSubscribed: false, error: e.message ?? 'Restore failed' };
  }
};
