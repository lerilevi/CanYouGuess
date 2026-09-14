/**
 * Crash capture shared by the pre-router entry point, React error boundary,
 * previous-crash screen, and on-device diagnostic tests.
 *
 * This module intentionally has no runtime imports. `index.js` must be able to
 * evaluate it and install ErrorUtils before expo-router/entry evaluates any app
 * module. Storage dependencies are required lazily only after installation.
 */

const LAST_FATAL_KEY = '@canyouguess_last_fatal_error';
const NATIVE_FATAL_FILENAME = 'canyouguess-native-fatal.json';
const DEFAULT_HANDLER_DEADLINE_MS = 250;

export type CrashSource = 'global' | 'rejection' | 'render-boundary' | 'native-rctfatal';

export interface CapturedCrashRecord {
  id: string;
  message: string;
  stack: string | null;
  isFatal: boolean;
  /** ISO timestamp of when the error was caught. */
  at: string;
  source: CrashSource;
  details?: unknown;
}

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type LegacyFileSystemLike = {
  documentDirectory: string | null;
  readAsStringAsync: (uri: string) => Promise<string>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

function asyncStorage(): AsyncStorageLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
}

function legacyFileSystem(): LegacyFileSystemLike {
  // SDK 53 / expo-file-system 18 exports the URI-based API from its root.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system') as LegacyFileSystemLike;
}

function nativeFatalUri(): string | null {
  try {
    const root = legacyFileSystem().documentDirectory;
    return root ? `${root}${NATIVE_FATAL_FILENAME}` : null;
  } catch {
    return null;
  }
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

export function createCrashRecord(
  error: unknown,
  source: CrashSource,
  isFatal: boolean,
  details?: unknown,
): CapturedCrashRecord {
  const { message, stack } = describe(error);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message,
    stack,
    isFatal,
    at: new Date().toISOString(),
    source,
    ...(details === undefined ? {} : { details }),
  };
}

export async function persistCrashRecord(record: CapturedCrashRecord): Promise<void> {
  try {
    await asyncStorage().setItem(LAST_FATAL_KEY, JSON.stringify(record));
  } catch {
    // The native RCTFatal hook is the final synchronous fallback for fatal
    // errors. There is no safe recovery action if JS storage is unavailable.
  }
}

function malformedRecord(raw: string, source: CrashSource, reason: unknown): CapturedCrashRecord {
  return {
    id: `malformed-${Date.now()}`,
    message: 'A saved crash record exists, but its JSON could not be parsed.',
    stack: null,
    isFatal: true,
    at: new Date().toISOString(),
    source,
    details: {
      parseError: reason instanceof Error ? reason.message : String(reason),
      raw,
    },
  };
}

function parseRecord(raw: string, fallbackSource: CrashSource): CapturedCrashRecord {
  try {
    const value = JSON.parse(raw) as Partial<CapturedCrashRecord>;
    if (!value || typeof value !== 'object' || typeof value.message !== 'string') {
      throw new Error('Record is missing a string message.');
    }
    return {
      id: typeof value.id === 'string' ? value.id : `legacy-${Date.now()}`,
      message: value.message,
      stack: typeof value.stack === 'string' ? value.stack : null,
      isFatal: value.isFatal !== false,
      at: typeof value.at === 'string' ? value.at : new Date().toISOString(),
      source:
        value.source === 'global' ||
        value.source === 'rejection' ||
        value.source === 'render-boundary' ||
        value.source === 'native-rctfatal'
          ? value.source
          : fallbackSource,
      ...(value.details === undefined ? {} : { details: value.details }),
    };
  } catch (error) {
    return malformedRecord(raw, fallbackSource, error);
  }
}

let installed = false;

/**
 * Installs global error and rejection handlers. The fatal handler gives the
 * AsyncStorage write up to 250 ms, then always delegates to React Native. The
 * native RCTFatal hook synchronously records the same failure immediately
 * before React Native aborts, so correctness no longer depends on that async
 * write winning a process-termination race.
 */
export function installErrorReporter(): void {
  if (installed) return;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) {
    console.warn('[errorReporter] ErrorUtils was unavailable at app entry.');
    return;
  }

  installed = true;
  const defaultHandler = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const record = createCrashRecord(error, 'global', !!isFatal);
    console.error(
      `[errorReporter] ${isFatal ? 'FATAL' : 'non-fatal'} JS error:`,
      record.message,
      record.stack,
    );

    let delegated = false;
    const delegate = () => {
      if (delegated) return;
      delegated = true;
      defaultHandler(error, isFatal);
    };

    void persistCrashRecord(record).then(delegate, delegate);
    setTimeout(delegate, DEFAULT_HANDLER_DEADLINE_MS);
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracking = require('promise/setimmediate/rejection-tracking') as {
      enable: (options: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
        onHandled: (id: number) => void;
      }) => void;
    };
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id, error) => {
        const record = createCrashRecord(error, 'rejection', false);
        console.warn('[errorReporter] Unhandled promise rejection:', record.message);
        void persistCrashRecord(record);
      },
      onHandled: () => {},
    });
  } catch {
    console.warn('[errorReporter] Promise rejection tracking is unavailable.');
  }
}

async function readNativeRecord(): Promise<CapturedCrashRecord | null> {
  const uri = nativeFatalUri();
  if (!uri) return null;
  try {
    const raw = await legacyFileSystem().readAsStringAsync(uri);
    return parseRecord(raw, 'native-rctfatal');
  } catch {
    return null;
  }
}

/**
 * Returns the best pending record without deleting anything. A synchronous
 * native RCTFatal record wins over the best-effort JS AsyncStorage copy.
 */
export async function getPendingCrashRecord(): Promise<CapturedCrashRecord | null> {
  const nativeRecord = await readNativeRecord();
  if (nativeRecord) return nativeRecord;

  try {
    const raw = await asyncStorage().getItem(LAST_FATAL_KEY);
    return raw ? parseRecord(raw, 'global') : null;
  } catch {
    return null;
  }
}

/** Deletes pending native and JS copies only after an explicit user action. */
export async function dismissPendingCrashRecord(): Promise<void> {
  const removals: Promise<unknown>[] = [asyncStorage().removeItem(LAST_FATAL_KEY)];
  const uri = nativeFatalUri();
  if (uri) {
    removals.push(legacyFileSystem().deleteAsync(uri, { idempotent: true }));
  }
  await Promise.allSettled(removals);
}

/** Formats a captured error into a block suitable for a bug report. */
export function formatForReport(record: CapturedCrashRecord): string {
  let details = '';
  if (record.details !== undefined) {
    try {
      details = `\n\ndetails:\n${JSON.stringify(record.details, null, 2)}`;
    } catch {
      details = '\n\ndetails: (could not serialise details)';
    }
  }

  return [
    `id:     ${record.id}`,
    `when:   ${record.at}`,
    `source: ${record.source}${record.isFatal ? ' (fatal)' : ''}`,
    `error:  ${record.message}`,
    '',
    record.stack ?? '(no stack captured)',
  ].join('\n') + details;
}
