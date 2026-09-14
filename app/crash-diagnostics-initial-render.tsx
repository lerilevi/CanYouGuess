import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

const ENABLED = process.env.EXPO_PUBLIC_ENABLE_CRASH_DIAGNOSTICS === '1';
let shouldThrowOnFirstRender = true;

export default function InitialRenderDiagnosticScreen() {
  const router = useRouter();

  if (!ENABLED) {
    return <Redirect href="/" />;
  }

  if (shouldThrowOnFirstRender) {
    shouldThrowOnFirstRender = false;
    throw new Error('[Crash diagnostics] initial-render failure');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Initial-render test completed</Text>
      <Text style={styles.body}>
        The error boundary recovered after you dismissed the saved report.
      </Text>
      <Pressable onPress={() => router.back()} style={styles.button}>
        <Text style={styles.buttonText}>Back to diagnostics</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#080c18',
  },
  heading: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  body: { color: '#c9d3ee', fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#247cff',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
