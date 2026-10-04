import { useEffect, useSyncExternalStore, ReactNode } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider, useAuth } from '@/template';
import { GameProvider } from '@/contexts/GameContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { StatusBar } from 'expo-status-bar';
import { getIdentityScope, subscribeIdentity, identityKey } from '@/services/identityScope';
import { initializeAds } from '@/services/adService';
import { CrashDiagnosticGate } from '@/components/feature/CrashDiagnosticGate';
import { RootErrorBoundary } from '@/components/feature/RootErrorBoundary';

/** Starts external SDKs only after the previous-crash gate is clear. */
function ServiceInitialization() {
  useEffect(() => {
    const timer = setTimeout(() => {
      initializeAds();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

/** Key ALL user-owned providers and route-local state, including drafts/modals. */
function IdentitySession({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const scope = useSyncExternalStore(subscribeIdentity, getIdentityScope, getIdentityScope);
  if (scope.userId !== (user?.id ?? null)) return null;
  return <SubscriptionProvider key={identityKey(scope)}>{children}</SubscriptionProvider>;
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <CrashDiagnosticGate>
          <SafeAreaProvider>
            <AuthProvider>
              <ServiceInitialization />
              <IdentitySession>
                <AlertProvider>
                <GameProvider>
                  <StatusBar style="light" />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="onboarding" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="crash-diagnostics" />
                    <Stack.Screen name="crash-diagnostics-initial-render" />
                  </Stack>
                </GameProvider>
                </AlertProvider>
              </IdentitySession>
            </AuthProvider>
          </SafeAreaProvider>
      </CrashDiagnosticGate>
    </RootErrorBoundary>
  );
}
