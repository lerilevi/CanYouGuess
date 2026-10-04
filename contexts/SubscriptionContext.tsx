import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { checkIsSubscribed, loginPurchasesUser, logoutPurchasesUser } from '@/services/purchasesService';
import { useAuth } from '@/template';
import { getIdentityScope, isCurrentIdentity, subscribeIdentity } from '@/services/identityScope';

interface PurchaseContextType {
  isPaid: boolean;
  isLoading: boolean;
  status: 'unknown' | 'free' | 'paid';
  refreshPurchase: () => Promise<void>;
}

export const SubscriptionContext = createContext<PurchaseContextType>({
  isPaid: false,
  isLoading: true,
  status: 'unknown',
  refreshPurchase: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [paidState, setPaidState] = useState<{ owner: string | null; value: boolean | null }>({ owner: null, value: null });
  const [isLoading, setIsLoading] = useState(true);
  const revision = useRef(0);

  const refreshPurchase = useCallback(async () => {
    const scope = getIdentityScope();
    const request = ++revision.current;
    setPaidState({ owner: user?.id ?? null, value: null });
    setIsLoading(true);
    try {
      if (!user?.id) {
        await logoutPurchasesUser();
        return;
      }
      await loginPurchasesUser(user.id);
      const paid = await checkIsSubscribed();
      if (isCurrentIdentity(scope) && revision.current === request) setPaidState({ owner: user.id, value: paid });
    } catch {
      // Unknown/retry is not a free entitlement and never retains another UID's paid value.
    } finally {
      if (getIdentityScope() === scope && revision.current === request) setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshPurchase();
    const unsubscribe = subscribeIdentity(() => {
      revision.current++;
      setPaidState({ owner: null, value: null });
      setIsLoading(true);
    });
    return () => { revision.current++; unsubscribe(); };
  }, [refreshPurchase]);

  const value = paidState.owner === user?.id ? paidState.value : null;

  return (
    <SubscriptionContext.Provider value={{ isPaid: value === true, isLoading, status: value === null ? 'unknown' : value ? 'paid' : 'free', refreshPurchase }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
