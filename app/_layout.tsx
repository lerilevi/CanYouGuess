import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider, useAuth } from '@/template';
import { GameProvider } from '@/contexts/GameContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { StatusBar } from 'expo-status-bar';
import { initializePurchases, loginPurchasesUser, logoutPurchasesUser } from '@/services/purchasesService';
import { initializeAds } from '@/services/adService';

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
    // Delay SDK initialization by one event-loop tick so the native app
    // delegate finishes applicationDidFinishLaunching before any SDK tries
    // to access native modules. Both react-native-purchases and
    // react-native-google-mobile-ads can throw NSExceptions on a background
    // queue if called synchronously during the first JS render cycle.
    const timer = setTimeout(() => {
      initializePurchases();
      // initializeAds(); // Disabled for Option A isolation test build
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AlertProvider>
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
