// Must be first: installs the global JS error handler before any other module
// can throw, so a fatal error is persisted and readable on the next launch.
import { installErrorReporter } from '@/services/errorReporter';
installErrorReporter();

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider, useAuth } from '@/template';
import { GameProvider } from '@/contexts/GameContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { StatusBar } from 'expo-status-bar';
import { initializePurchases, loginPurchasesUser, logoutPurchasesUser } from '@/services/purchasesService';
import { initializeAds } from '@/services/adService';
import { PreviousCrashNotice } from '@/components/feature/PreviousCrashNotice';

/** Syncs RevenueCat identity whenever the auth user changes. */
function PurchasesSync() {
  const { user } = useAuth();

  useEffect(() => {
  if (user?.id) {
    loginPurchasesUser(user.id);
  } else {
    logoutPurchasesUser();
  }
}, [user?.id]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
  const timer = setTimeout(() => {
    initializePurchases();
    initializeAds();
  }, 0);
  return () => clearTimeout(timer);
}, []);

  return (
    <AlertProvider>
      <PreviousCrashNotice />
      <SafeAreaProvider>
        <AuthProvider>
          <PurchasesSync />
          <SubscriptionProvider>
            <GameProvider>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="login" />

              </Stack>
            </GameProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
