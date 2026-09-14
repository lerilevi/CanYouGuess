import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { getPendingCrashRecord } from '@/services/errorReporter';

const ENABLED = process.env.EXPO_PUBLIC_ENABLE_CRASH_DIAGNOSTICS === '1';

interface TestCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  onPress: () => void;
  destructive?: boolean;
}

function TestCard({ title, description, buttonLabel, onPress, destructive = false }: TestCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          destructive && styles.destructiveButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function CrashDiagnosticsScreen() {
  const router = useRouter();
  const [rejectionStatus, setRejectionStatus] = useState('Not run');

  if (!ENABLED) {
    return <Redirect href="/" />;
  }

  const runModuleLoadFailure = () => {
    setTimeout(() => {
      // This require evaluates a module whose top level throws. Keeping it in a
      // timer prevents the React event callback from changing the error path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../services/diagnostics/throwOnImport');
    }, 0);
  };

  const runTimerFailure = () => {
    setTimeout(() => {
      throw new Error('[Crash diagnostics] timer/global failure');
    }, 0);
  };

  const runRejectionFailure = () => {
    setRejectionStatus('Waiting for rejection tracker…');
    void Promise.reject(new Error('[Crash diagnostics] unhandled rejection failure'));
    setTimeout(() => {
      void getPendingCrashRecord().then((record) => {
        setRejectionStatus(
          record?.source === 'rejection'
            ? `Captured: ${record.message}`
            : `Not captured (found ${record?.source ?? 'no record'})`,
        );
      });
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>DIAGNOSTIC BUILD ONLY</Text>
        <Text style={styles.heading}>Crash capture tests</Text>
        <Text style={styles.intro}>
          Tests 1 and 3 intentionally terminate the app. Test 2 replaces the app with the error-boundary report, while test 4 remains on this screen.
        </Text>

        <TestCard
          title="1. Module-load failure"
          description="Evaluates a new module whose top-level code throws. Expected: app terminates, then a native-rctfatal report appears after relaunch."
          buttonLabel="Crash during module load"
          destructive
          onPress={runModuleLoadFailure}
        />
        <TestCard
          title="2. Initial-render failure"
          description="Navigates to a dedicated route that throws on its first render. Expected: the top-level React boundary immediately shows the diagnostic screen without terminating."
          buttonLabel="Throw during render"
          destructive
          onPress={() => router.push('/crash-diagnostics-initial-render')}
        />
        <TestCard
          title="3. Timer/global failure"
          description="Throws outside React from a timer. Expected: app terminates, then a native-rctfatal report appears after relaunch."
          buttonLabel="Crash from timer"
          destructive
          onPress={runTimerFailure}
        />
        <TestCard
          title="4. Unhandled rejection"
          description="Rejects a promise without a handler. Expected: the app remains open and the rejection tracker saves a non-fatal record."
          buttonLabel="Reject promise"
          onPress={runRejectionFailure}
        />
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Rejection test status</Text>
          <Text selectable style={styles.statusText}>{rejectionStatus}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#080c18' },
  content: { padding: 22, paddingBottom: 48, gap: 16 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 },
  backText: { color: '#71d7ff', fontSize: 17, fontWeight: '700' },
  eyebrow: { color: '#ffbb55', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heading: { color: '#ffffff', fontSize: 29, fontWeight: '800' },
  intro: { color: '#c9d3ee', fontSize: 15, lineHeight: 22 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#33405f',
    backgroundColor: '#121a2d',
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  description: { color: '#aebbd8', fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#247cff',
    paddingHorizontal: 14,
  },
  destructiveButton: { backgroundColor: '#b8324f' },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  statusCard: { borderRadius: 12, backgroundColor: '#02050c', padding: 14, gap: 6 },
  statusLabel: { color: '#71d7ff', fontSize: 12, fontWeight: '700' },
  statusText: { color: '#d7e2ff', fontSize: 13, lineHeight: 18 },
});
