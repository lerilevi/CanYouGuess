import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CapturedCrashRecord, formatForReport } from '@/services/errorReporter';

interface CrashDiagnosticScreenProps {
  record: CapturedCrashRecord;
  onDismiss: () => Promise<void> | void;
  heading?: string;
  dismissLabel?: string;
}

export function CrashDiagnosticScreen({
  record,
  onDismiss,
  heading = 'Crash details captured',
  dismissLabel = 'Dismiss and continue',
}: CrashDiagnosticScreenProps) {
  const report = useMemo(() => formatForReport(record), [record]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [dismissing, setDismissing] = useState(false);

  const copyReport = async () => {
    try {
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
          This report stays on this device until you dismiss it. Copy the full details before continuing.
        </Text>

        <View style={styles.summaryCard}>
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

        <Pressable
          accessibilityRole="button"
          onPress={copyReport}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'failed'
                ? 'Copy failed — select the report text'
                : 'Copy full report'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={dismissing}
          onPress={dismiss}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          {dismissing ? (
            <ActivityIndicator color="#c9d3ee" />
          ) : (
            <Text style={styles.secondaryButtonText}>{dismissLabel}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#080c18' },
  content: { flexGrow: 1, padding: 24, gap: 16 },
  eyebrow: { color: '#71d7ff', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  explanation: { color: '#c9d3ee', fontSize: 15, lineHeight: 22 },
  summaryCard: {
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
  reportCard: {
    minHeight: 220,
    borderRadius: 14,
    backgroundColor: '#02050c',
    borderWidth: 1,
    borderColor: '#26314b',
    padding: 14,
  },
  report: { color: '#d7e2ff', fontFamily: 'Courier', fontSize: 12, lineHeight: 18 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#247cff',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#556382',
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: '#c9d3ee', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
