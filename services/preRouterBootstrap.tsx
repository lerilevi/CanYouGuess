import { Component, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { registerRootComponent } from 'expo';
import {
  CapturedCrashRecord,
  captureFirstFatalDuring,
  createCrashRecord,
  dismissPendingCrashRecord,
  formatForReport,
  getPendingCrashRecord,
  persistCrashRecord,
} from './errorReporter';

type BootstrapState =
  | { phase: 'checking'; record: null }
  | { phase: 'diagnostic'; record: CapturedCrashRecord }
  | { phase: 'manual'; record: null }
  | { phase: 'router'; record: null };

interface RouterBoundaryState {
  record: CapturedCrashRecord | null;
}

const manualRouterStartEnabled =
  process.env.EXPO_PUBLIC_DIAGNOSTIC_MANUAL_ROUTER_START === '1';

function readyState(): BootstrapState {
  return manualRouterStartEnabled
    ? { phase: 'manual', record: null }
    : { phase: 'router', record: null };
}

/**
 * Loads Expo Router only after the native/JS crash stores have been checked.
 * Keeping this require inside a child render lets the surrounding boundary
 * catch synchronous route and layout module evaluation failures.
 */
function RouterLoader() {
  const routerEntry = captureFirstFatalDuring(() => {
    // This is the same component used by expo-router/entry-classic. Metro's
    // guarded loader reports a module-factory error to ErrorUtils and returns
    // undefined, so the interceptor above must run around this exact require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-router/build/qualified-entry') as
      | { App?: () => ReactNode }
      | undefined;
  });
  if (!routerEntry?.App) {
    throw new Error('Expo Router qualified-entry loaded without an App export.');
  }
  const RouterApp = routerEntry.App;
  return <RouterApp />;
}

class RouterImportBoundary extends Component<{ children: ReactNode }, RouterBoundaryState> {
  state: RouterBoundaryState = { record: null };

  static getDerivedStateFromError(error: unknown): RouterBoundaryState {
    return { record: createCrashRecord(error, 'render-boundary', true) };
  }

  componentDidCatch(_error: unknown) {
    if (this.state.record) void persistCrashRecord(this.state.record);
  }

  private retry = async () => {
    await dismissPendingCrashRecord();
    this.setState({ record: null });
  };

  render() {
    if (this.state.record) {
      return (
        <PreRouterCrashScreen
          heading="App startup failed"
          record={this.state.record}
          dismissLabel="Retry app startup"
          onDismiss={this.retry}
        />
      );
    }
    return this.props.children;
  }
}

function PreRouterBootstrap() {
  const [state, setState] = useState<BootstrapState>({ phase: 'checking', record: null });

  useEffect(() => {
    let mounted = true;
    void getPendingCrashRecord().then(
      (record) => {
        if (!mounted) return;
        setState(record ? { phase: 'diagnostic', record } : readyState());
      },
      () => {
        if (mounted) setState(readyState());
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  if (state.phase === 'checking') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#71d7ff" />
        <Text style={styles.loadingText}>Checking crash diagnostics…</Text>
      </View>
    );
  }

  if (state.phase === 'diagnostic') {
    return (
      <PreRouterCrashScreen
        heading="The previous session crashed"
        record={state.record}
        dismissLabel="Dismiss report and retry"
        onDismiss={async () => {
          await dismissPendingCrashRecord();
          setState(readyState());
        }}
      />
    );
  }

  if (state.phase === 'manual') {
    return (
      <ManualStartupShell
        onStart={() => setState({ phase: 'router', record: null })}
      />
    );
  }

  return (
    <RouterImportBoundary>
      <RouterLoader />
    </RouterImportBoundary>
  );
}

function ManualStartupShell({ onStart }: { onStart: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shellContent}>
        <Text style={styles.eyebrow}>CAN YOU GUESS? DIAGNOSTICS</Text>
        <Text style={styles.heading}>Startup shell reached</Text>
        <Text style={styles.explanation}>
          This screen loaded before Expo Router, the app layout, providers, and startup services.
          Tap below when you are ready to load the real app.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Build 14 primary-error checkpoint</Text>
          <Text style={styles.shellStatus}>
            The first fatal raised while Expo Router loads will be shown here without a secondary error replacing it.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Start Expo Router</Text>
        </Pressable>

        <Text style={styles.shellHint}>
          After tapping, note whether the app opens, this screen changes to an error report, or the app closes.
        </Text>
      </View>
    </SafeAreaView>
  );
}

interface PreRouterCrashScreenProps {
  heading: string;
  record: CapturedCrashRecord;
  dismissLabel: string;
  onDismiss: () => Promise<void>;
}

function PreRouterCrashScreen({
  heading,
  record,
  dismissLabel,
  onDismiss,
}: PreRouterCrashScreenProps) {
  const report = useMemo(() => formatForReport(record), [record]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [dismissing, setDismissing] = useState(false);

  const copy = async () => {
    try {
      // Keep Clipboard out of the recovery screen's module-evaluation path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(report);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const dismiss = async () => {
    setDismissing(true);
    try {
      await onDismiss();
    } finally {
      setDismissing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CAN YOU GUESS? DIAGNOSTICS</Text>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.explanation}>
          This recovery screen runs before the app router, so startup errors cannot hide the saved report.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Error</Text>
          <Text selectable style={styles.message}>{record.message}</Text>
          <Text style={styles.metadata}>{record.at}</Text>
          <Text style={styles.metadata}>
            {record.source}{record.isFatal ? ' · fatal' : ' · non-fatal'}
          </Text>
        </View>

        <Text style={styles.label}>Full report</Text>
        <View style={styles.reportCard}>
          <Text selectable style={styles.report}>{report}</Text>
        </View>

        <Pressable onPress={copy} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'failed'
                ? 'Copy failed — select the report text'
                : 'Copy full report'}
          </Text>
        </Pressable>

        <Pressable
          disabled={dismissing}
          onPress={dismiss}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          {dismissing ? (
            <ActivityIndicator color="#c9d3ee" />
          ) : (
            <Text style={styles.secondaryText}>{dismissLabel}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function registerPreRouterBootstrap(): void {
  registerRootComponent(PreRouterBootstrap);
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#080c18',
  },
  loadingText: { color: '#c9d3ee', fontSize: 14 },
  safeArea: { flex: 1, backgroundColor: '#080c18' },
  content: { flexGrow: 1, padding: 24, gap: 16 },
  shellContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 20,
  },
  eyebrow: { color: '#71d7ff', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  explanation: { color: '#c9d3ee', fontSize: 15, lineHeight: 22 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#33405f',
    backgroundColor: '#121a2d',
    padding: 16,
    gap: 8,
  },
  label: { color: '#71d7ff', fontSize: 13, fontWeight: '700' },
  message: { color: '#ffffff', fontSize: 17, lineHeight: 24, fontWeight: '600' },
  metadata: { color: '#93a1c2', fontSize: 12 },
  shellStatus: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  shellHint: { color: '#93a1c2', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  reportCard: {
    minHeight: 220,
    borderRadius: 14,
    backgroundColor: '#02050c',
    borderWidth: 1,
    borderColor: '#26314b',
    padding: 14,
  },
  report: { color: '#d7e2ff', fontFamily: 'Courier', fontSize: 12, lineHeight: 18 },
  primary: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#247cff',
    paddingHorizontal: 18,
  },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondary: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#556382',
    paddingHorizontal: 18,
  },
  secondaryText: { color: '#c9d3ee', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
