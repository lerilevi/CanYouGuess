import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { checkIsSubscribed } from '@/services/purchasesService';
import { useAuth } from '@/template';

interface PurchaseContextType {
  isPaid: boolean;
  isLoading: boolean;
  refreshPurchase: () => Promise<void>;
}

export const SubscriptionContext = createContext<PurchaseContextType>({
  isPaid: false,
  isLoading: true,
  refreshPurchase: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isPaid, setIsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPurchase = useCallback(async () => {
    setIsLoading(true);
    try {
      // checkIsSubscribed checks RevenueCat entitlement — works for one-time non-consumable too
      const paid = await checkIsSubscribed();
      setIsPaid(paid);
    } catch {
      setIsPaid(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPurchase();
  }, [user, refreshPurchase]);

  return (
    <SubscriptionContext.Provider value={{ isPaid, isLoading, refreshPurchase }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
