import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  CapturedCrashRecord,
  dismissPendingCrashRecord,
  getPendingCrashRecord,
} from '@/services/errorReporter';
import { CrashDiagnosticScreen } from './CrashDiagnosticScreen';

interface CrashDiagnosticGateProps {
  children: ReactNode;
}

export function CrashDiagnosticGate({ children }: CrashDiagnosticGateProps) {
  const [checking, setChecking] = useState(true);
  const [record, setRecord] = useState<CapturedCrashRecord | null>(null);

  useEffect(() => {
    let mounted = true;
    void getPendingCrashRecord().then((pending) => {
      if (!mounted) return;
      setRecord(pending);
      setChecking(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#71d7ff" />
        <Text style={styles.loadingText}>Checking crash diagnostics…</Text>
      </View>
    );
  }

  if (record) {
    return (
      <CrashDiagnosticScreen
        record={record}
        heading={record.isFatal ? 'The previous session crashed' : 'A previous error was captured'}
        onDismiss={async () => {
          await dismissPendingCrashRecord();
          setRecord(null);
        }}
      />
    );
  }

  return <>{children}</>;
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
});
