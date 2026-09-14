// Keep these as ordered CommonJS calls. Static imports are hoisted by Babel,
// which would let expo-router (and every route module) evaluate before the
// crash reporter is installed.
const { installErrorReporter } = require('./services/errorReporter');

installErrorReporter();
require('expo-router/entry');
