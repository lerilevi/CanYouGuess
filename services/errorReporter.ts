/**
 * errorReporter.ts
 *
 * Captures fatal JS errors so they survive the crash and can be read on the
 * next launch.
 *
 * Why this exists: build 1.0.6 crashed via RN's `RCTExceptionsManager`
 * (`com.facebook.react.ExceptionsManagerQueue`) — the path RN uses to turn an
 * unhandled JS error into a native abort. The resulting `.ips` contains only
 * unsymbolicated binary offsets; the actual JS message and stack are nowhere in
 * it. This module writes them to disk *before* handing control to RN's default
 * handler, so the next launch can surface them.
 *
 * Import this module for its side effect as early as possible — it must be the
 * first import in `app/_layout.tsx`, before anything that can throw.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_FATAL_KEY = '@canyouguess_last_fatal_error';

export interface CapturedFatalError {
  message: string;
  stack: string | null;
  isFatal: boolean;
  /** ISO timestamp of when the error was caught. */
  at: string;
  /** 'global' = ErrorUtils handler, 'rejection' = unhandled promise rejection. */
  source: 'global' | 'rejection';
}

/** Serialises anything throwable into a readable message. */
function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return { message: JSON.stringify(error), stack: null };
    } catch {
      return { message: Object.prototype.toString.call(error), stack: null };
    }
  }
  return { message: String(error), stack: null };
}

async function persist(record: CapturedFatalError): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_FATAL_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable — nothing further we can do from a dying process.
  }
}

let installed = false;

/**
 * Installs the global handlers. Idempotent, and safe to call on any platform.
 */
export function installErrorReporter(): void {
  if (installed) return;
  installed = true;

  // ─── Fatal JS errors (the build 1.0.6 path) ────────────────────────────────
  const errorUtils = (globalThis as { ErrorUtils?: {
    getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
  } }).ErrorUtils;

  if (errorUtils) {
    const defaultHandler = errorUtils.getGlobalHandler();

    errorUtils.setGlobalHandler(async (error: unknown, isFatal?: boolean) => {
      const { message, stack } = describe(error);
      console.error(`[errorReporter] ${isFatal ? 'FATAL' : 'non-fatal'} JS error:`, message, stack);

      // Await the write so it has a chance to flush before RN's default
      // handler calls into RCTExceptionsManager and aborts the process.
      await persist({ message, stack, isFatal: !!isFatal, at: new Date().toISOString(), source: 'global' });

      // Never swallow it — preserve RN's normal behaviour (redbox in dev,
      // native crash in release) so nothing silently changes.
      defaultHandler(error, isFatal);
    });
  }

  // ─── Unhandled promise rejections ──────────────────────────────────────────
  // These are non-fatal in RN, but the launch path is full of un-awaited
  // promises (loadUserData, detectCountryByIP, initializePurchases), so a
  // rejection here is a strong lead even when it is not what aborts.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id: number, error: unknown) => {
        const { message, stack } = describe(error);
        console.warn('[errorReporter] Unhandled promise rejection:', message);
        void persist({ message, stack, isFatal: false, at: new Date().toISOString(), source: 'rejection' });
      },
      onHandled: () => {},
    });
  } catch {
    // rejection-tracking not resolvable on this RN version — skip silently.
  }
}

/**
 * Returns the fatal error recorded before the last crash (if any) and clears
 * it, so each crash is reported exactly once.
 */
export async function getAndClearLastFatalError(): Promise<CapturedFatalError | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_FATAL_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(LAST_FATAL_KEY);
    return JSON.parse(raw) as CapturedFatalError;
  } catch {
    return null;
  }
}

/** Formats a captured error into a block suitable for pasting into a bug report. */
export function formatForReport(e: CapturedFatalError): string {
  return [
    `when:   ${e.at}`,
    `source: ${e.source}${e.isFatal ? ' (fatal)' : ''}`,
    `error:  ${e.message}`,
    '',
    e.stack ?? '(no stack captured)',
  ].join('\n');
}
