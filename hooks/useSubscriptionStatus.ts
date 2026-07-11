import { useContext } from 'react';
import { SubscriptionContext } from '@/contexts/SubscriptionContext';

export function useSubscriptionStatus() {
  const ctx = useContext(SubscriptionContext);
  return {
    isPaid: ctx.isPaid,
    isLoading: ctx.isLoading,
    refreshPurchase: ctx.refreshPurchase,
    // Legacy alias kept for any remaining callsites
    isSubscribed: ctx.isPaid,
    refreshSubscription: ctx.refreshPurchase,
  };
}
