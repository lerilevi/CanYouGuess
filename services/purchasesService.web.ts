/**
 * purchasesService.web.ts
 *
 * Web stub for react-native-purchases (RevenueCat).
 * Metro automatically picks this file over purchasesService.ts on the web
 * platform, preventing the native-only module from being bundled.
 */

export const initializePurchases = async (_userId?: string): Promise<void> => {};

export const loginPurchasesUser = async (_userId: string): Promise<void> => {};

export const logoutPurchasesUser = async (): Promise<void> => {};

export const getCustomerInfo = async (): Promise<null> => null;

export const checkIsSubscribed = async (): Promise<boolean> => false;

export const getOfferings = async (): Promise<null> => null;

export const purchasePackage = async (
  _packageToPurchase: unknown
): Promise<{ success: boolean; error?: string }> => ({
  success: false,
  error: 'Purchases not available on web',
});

export const restorePurchases = async (): Promise<{
  success: boolean;
  isSubscribed: boolean;
  error?: string;
}> => ({
  success: false,
  isSubscribed: false,
  error: 'Purchases not available on web',
});
