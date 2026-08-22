import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  getAndClearLastFatalError,
  formatForReport,
} from '@/services/errorReporter';

/**
 * On mount, checks whether the previous session died from a JS error captured
 * by errorReporter. If so, shows it once and offers to copy it to the
 * clipboard so it can be pasted into a bug report.
 *
 * Deliberately uses React Native's own `Alert` rather than the app's
 * AlertProvider: this needs to work even when app context providers are part
 * of what failed.
 *
 * Rendered only in release TestFlight-style builds; in dev the redbox already
 * shows the error with a better stack.
 */
export function PreviousCrashNotice() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const captured = await getAndClearLastFatalError();
      if (cancelled || !captured) return;

      const report = formatForReport(captured);
      console.error('[PreviousCrashNotice] Previous session ended with:\n' + report);

      Alert.alert(
        captured.isFatal ? 'Previous crash captured' : 'Previous error captured',
        `${captured.message}\n\n(${captured.at})`,
        [
          {
            text: 'Copy details',
            onPress: () => {
              Clipboard.setStringAsync(report).catch(() => {});
            },
          },
          { text: 'Dismiss', style: 'cancel' },
        ],
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
