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
import { assertCurrentIdentity, captureIdentity, getIdentityScope, IdentityScope, StaleIdentityError } from './identityScope';

// ─── Lazy native module access ────────────────────────────────────────────────

type PurchasesModule = typeof import('react-native-purchases');

const REVENUECAT_DISABLED_FOR_STARTUP_BISECTION =
  process.env.EXPO_PUBLIC_DISABLE_REVENUECAT_FOR_STARTUP_BISECTION === '1';

function getNativePurchases(): PurchasesModule | null {
  // Diagnostic builds can keep the native dependency linked while preventing
  // its JavaScript entry point (and NativeEventEmitter setup) from evaluating.
  // This cleanly isolates RevenueCat without changing the rest of app startup.
  if (REVENUECAT_DISABLED_FOR_STARTUP_BISECTION) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases') as PurchasesModule;
  } catch {
    return null;
  }
}

// ─── Initialisation ──────────────────────────────────────────────────────────

let _initialized = false;
let _initializing: Promise<void> | null = null;
let _sdkUserId: string | null = null;
let _queue: Promise<unknown> = Promise.resolve();

function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const result = _queue.catch(() => {}).then(operation);
  _queue = result;
  return result;
}

export const initializePurchases = async (userId?: string): Promise<void> => {
  if (_initialized) return;
  if (_initializing) return _initializing;
  const owner = userId ?? getIdentityScope().userId;
  if (!owner) throw new Error('Sign in before initializing purchases.');
  const mod = getNativePurchases();
  if (!mod) {
    throw new Error('Purchases are unavailable on this device.');
  }
  _initializing = (async () => {
    const apiKey = APP_CONFIG.revenueCatKey;
    if (!apiKey) {
      throw new Error('Purchase configuration is missing.');
    }
    mod.default.setLogLevel(mod.LOG_LEVEL.ERROR);
    await mod.default.configure({ apiKey, appUserID: owner });
    _sdkUserId = owner;
    _initialized = true;
  })();
  try { await _initializing; } finally { _initializing = null; }
};

// ─── Identity ────────────────────────────────────────────────────────────────

async function ensureIdentity(scope: IdentityScope): Promise<PurchasesModule> {
  assertCurrentIdentity(scope);
  await initializePurchases(scope.userId!);
  assertCurrentIdentity(scope);
  const mod = getNativePurchases();
  if (!mod) throw new Error('Purchases unavailable.');
  if (_sdkUserId !== scope.userId) {
    await mod.default.logIn(scope.userId!);
    _sdkUserId = scope.userId;
  }
  assertCurrentIdentity(scope);
  if (await mod.default.getAppUserID() !== scope.userId) throw new Error('Purchase identity is not synchronized.');
  assertCurrentIdentity(scope);
  return mod;
}

export const loginPurchasesUser = async (userId: string): Promise<void> => {
  const scope = captureIdentity(userId);
  await ordered(async () => { await ensureIdentity(scope); });
};

export const logoutPurchasesUser = async (): Promise<void> => {
  const scope = getIdentityScope();
  if (scope.userId) throw new Error('Auth must leave the player before purchase logout.');
  await ordered(async () => {
    if (getIdentityScope() !== scope) return; // B already arrived: logIn B, not another anonymous identity.
    const mod = getNativePurchases();
    if (_initializing) await _initializing;
    if (!_initialized || !mod || _sdkUserId === null) return;
    await mod.default.logOut();
    _sdkUserId = null;
  });
};

// ─── Customer info ───────────────────────────────────────────────────────────

export const getCustomerInfo = async (): Promise<import('react-native-purchases').CustomerInfo | null> => {
  const scope = captureIdentity();
  return ordered(async () => {
    const mod = await ensureIdentity(scope);
    const info = await mod.default.getCustomerInfo();
    assertCurrentIdentity(scope);
    return info;
  });
};

export const checkIsSubscribed = async (): Promise<boolean | null> => {
    const info = await getCustomerInfo();
    if (!info) return null;
    const entitlement = info.entitlements.active[APP_CONFIG.premiumEntitlementId];
    return !!entitlement;
};

// ─── Offerings ───────────────────────────────────────────────────────────────

export const getOfferings = async (): Promise<{
  current: { availablePackages: import('react-native-purchases').PurchasesPackage[] };
} | null> => {
  try {
    const scope = captureIdentity();
    return await ordered(async () => {
      const mod = await ensureIdentity(scope);
      const offerings = await mod.default.getOfferings();
      assertCurrentIdentity(scope);
      return offerings.current ? { current: { availablePackages: offerings.current.availablePackages } } : null;
    });
  } catch (err) {
    if (!(err instanceof StaleIdentityError)) console.warn('[Purchases] Offerings unavailable.');
    return null;
  }
};

// ─── Purchase ────────────────────────────────────────────────────────────────

export const purchasePackage = async (
  packageToPurchase: unknown
): Promise<{ success: boolean; error?: string }> => {
  try {
    const scope = captureIdentity();
    return await ordered(async () => {
      const mod = await ensureIdentity(scope);
      const { customerInfo } = await mod.default.purchasePackage(packageToPurchase as import('react-native-purchases').PurchasesPackage);
      assertCurrentIdentity(scope);
      return customerInfo.entitlements.active[APP_CONFIG.premiumEntitlementId]
        ? { success: true } : { success: false, error: 'Purchase completed but entitlement not found.' };
    });
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
    const scope = captureIdentity();
    return await ordered(async () => {
      const mod = await ensureIdentity(scope);
      const customerInfo = await mod.default.restorePurchases();
      assertCurrentIdentity(scope);
      return { success: true, isSubscribed: !!customerInfo.entitlements.active[APP_CONFIG.premiumEntitlementId] };
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { success: false, isSubscribed: false, error: e.message ?? 'Restore failed' };
  }
};
