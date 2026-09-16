// Keep these as ordered CommonJS calls. Static imports are hoisted by Babel,
// which would let expo-router (and every route module) evaluate before the
// crash reporter is installed.
const { installErrorReporter } = require('./services/errorReporter');

installErrorReporter();

if (process.env.EXPO_PUBLIC_ENABLE_CRASH_DIAGNOSTICS === '1') {
  // Register a minimal root before Expo Router evaluates any route module. A
  // persisted import-time crash can then be displayed instead of immediately
  // repeating before the normal React tree exists.
  const { registerPreRouterBootstrap } = require('./services/preRouterBootstrap');
  registerPreRouterBootstrap();
} else {
  require('expo-router/entry');
}
