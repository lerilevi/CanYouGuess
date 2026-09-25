import { Component, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  NativeModules,
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

type ExpoModuleMap = Record<string, unknown>;

interface ExpoLinkingLookupTrace {
  before: string;
  afterFailure?: string;
}

let routerLookupTrace: ExpoLinkingLookupTrace | null = null;

const manualRouterStartEnabled =
  process.env.EXPO_PUBLIC_DIAGNOSTIC_MANUAL_ROUTER_START === '1';

function readyState(): BootstrapState {
  return manualRouterStartEnabled
    ? { phase: 'manual', record: null }
    : { phase: 'router', record: null };
}

function inspectExpoModuleBridge(): string {
  type ExpoGlobal = { modules?: ExpoModuleMap };
  const expoGlobal = () => (globalThis as { expo?: ExpoGlobal }).expo;
  const describe = (modules: ExpoModuleMap | undefined) => {
    if (!modules) return 'absent';
    const names = Object.keys(modules);
    const samples = ['ExpoLinking', 'ExpoClipboard', 'ExpoFileSystem', 'ExpoConstants'];
    const present = samples.filter((name) => Object.prototype.hasOwnProperty.call(modules, name));
    return `${names.length} names; ${present.length ? present.join(', ') : 'none of the sample modules'}`;
  };

  try {
    const before = describe(expoGlobal()?.modules);
    // This is a legacy compatibility table, not the Swift module registry.
    const core = NativeModules.ExpoModulesCore as { installModules?: () => void } | undefined;
    const proxy = NativeModules.NativeUnimoduleProxy as
      | { exportedMethods?: ExpoModuleMap }
      | undefined;
    const afterProxy = describe(expoGlobal()?.modules);
    const legacyProxyExports = describe(proxy?.exportedMethods);

    let install = 'unavailable';
    if (typeof core?.installModules === 'function') {
      try {
        core.installModules();
        install = 'completed';
      } catch (error) {
        install = `failed: ${String(error)}`;
      }
    }

    return [
      `JSI before probe: ${before}`,
      `ExpoModulesCore: ${core ? 'present' : 'absent'}`,
      `NativeUnimoduleProxy: ${proxy ? 'present' : 'absent'}`,
      `Legacy proxy exports: ${legacyProxyExports}`,
      `JSI after proxy: ${afterProxy}`,
      `installModules: ${install}`,
      `JSI after install: ${describe(expoGlobal()?.modules)}`,
    ].join('\n');
  } catch (error) {
    return `Bridge inspection failed: ${String(error)}`;
  }
}

function describeLookupValue(value: unknown): string {
  return value === null ? 'null' : typeof value;
}

function describeLookupError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function inspectExpoLinkingLookup(previousHost?: ExpoModuleMap): {
  report: string;
  host: ExpoModuleMap | undefined;
} {
  const host = (globalThis as { expo?: { modules?: ExpoModuleMap } }).expo?.modules;
  const lines: string[] = [];

  try {
    const names = host ? Object.keys(host) : [];
    const listed = names.includes('ExpoLinking');
    const own = host ? Object.prototype.hasOwnProperty.call(host, 'ExpoLinking') : false;
    lines.push(`JSI: ${host ? `${names.length} names` : 'absent'}; ExpoLinking listed=${listed}; own=${own}`);
  } catch (error) {
    lines.push(`JSI enumeration threw ${describeLookupError(error)}`);
  }

  let directValue: unknown;
  let directReadSucceeded = false;
  try {
    directValue = host?.ExpoLinking;
    directReadSucceeded = true;
    lines.push(`Direct ExpoLinking value: ${describeLookupValue(directValue)}`);
  } catch (error) {
    lines.push(`Direct ExpoLinking read threw ${describeLookupError(error)}`);
  }

  try {
    // Deliberately load this inside the probe, not at module evaluation time.
    // This is the exact helper used by expo-linking's native entry point.
    const optionalValue = captureFirstFatalDuring(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require('expo-modules-core') as {
        requireOptionalNativeModule: (name: string) => unknown;
      };
      return core.requireOptionalNativeModule('ExpoLinking');
    });
    lines.push(`requireOptionalNativeModule: ${describeLookupValue(optionalValue)}`);
    if (directReadSucceeded && directValue != null && optionalValue != null) {
      lines.push(`Optional matches direct: ${Object.is(optionalValue, directValue)}`);
    }
  } catch (error) {
    lines.push(`requireOptionalNativeModule threw ${describeLookupError(error)}`);
  }

  const currentHost = (globalThis as { expo?: { modules?: ExpoModuleMap } }).expo?.modules;
  lines.push(`JSI host changed during probe: ${currentHost !== host}`);
  if (previousHost) lines.push(`JSI host changed since before Router: ${currentHost !== previousHost}`);
  return { report: lines.join('\n'), host: currentHost };
}

/**
 * Loads Expo Router only after the native/JS crash stores have been checked.
 * Keeping this require inside a child render lets the surrounding boundary
 * catch synchronous route and layout module evaluation failures.
 */
function RouterLoader() {
  const before = inspectExpoLinkingLookup();
  routerLookupTrace = { before: before.report };
  try {
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
  } catch (error) {
    routerLookupTrace.afterFailure = inspectExpoLinkingLookup(before.host).report;
    throw error;
  }
}

class RouterImportBoundary extends Component<{ children: ReactNode }, RouterBoundaryState> {
  state: RouterBoundaryState = { record: null };

  static getDerivedStateFromError(error: unknown): RouterBoundaryState {
    return {
      record: createCrashRecord(
        error,
        'render-boundary',
        true,
        routerLookupTrace ? { expoLinkingLookup: { ...routerLookupTrace } } : undefined,
      ),
    };
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
  const [moduleCheck, setModuleCheck] = useState('Tap below to inspect the native registry.');
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.shellContent}>
        <Text style={styles.eyebrow}>CAN YOU GUESS? DIAGNOSTICS</Text>
        <Text style={styles.heading}>Startup shell reached</Text>
        <Text style={styles.explanation}>
          This screen loaded before Expo Router, the app layout, providers, and startup services.
          Tap below when you are ready to load the real app.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Expo native module checkpoint</Text>
          <Text style={styles.shellStatus}>
            Inspect the bridge, then start Expo Router. Capture this panel if startup fails.
          </Text>
          <Text selectable style={styles.moduleCheck}>{moduleCheck}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setModuleCheck(inspectExpoModuleBridge())}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Inspect native modules</Text>
        </Pressable>

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
      </ScrollView>
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
  const lookupTrace =
    record.details &&
    typeof record.details === 'object' &&
    'expoLinkingLookup' in record.details
      ? (record.details.expoLinkingLookup as ExpoLinkingLookupTrace)
      : null;
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

        {lookupTrace && (
          <View style={styles.card}>
            <Text style={styles.label}>ExpoLinking lookup around Router import</Text>
            <Text selectable style={styles.moduleCheck}>
              {`Before:\n${lookupTrace.before}\n\nAfter failure:\n${lookupTrace.afterFailure ?? '(Router import did not fail)'}`}
            </Text>
          </View>
        )}

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
    flexGrow: 1,
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
  moduleCheck: { color: '#d7e2ff', fontFamily: 'Courier', fontSize: 12, lineHeight: 18 },
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
