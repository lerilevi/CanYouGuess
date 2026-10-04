/**
 * Offline diagnostic: execute the real provider/service source with React 19
 * and the installed reconciler; stub native/storage/network boundaries only.
 * No Supabase calls, AI calls, native SDK calls or production edits.
 * Fixtures below are synthetic, NOT an AI question-quality corpus.
 * Replays the recorded pre-repair commit, not today's repaired working files.
 * Run: node scripts/diagnostics/account-switch-repro.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { ConcurrentRoot, DefaultEventPriority } = require('react-reconciler/constants');

global.IS_REACT_ACT_ENVIRONMENT = true;
const base = path.resolve(__dirname, '../..');
const logs = [];

function sourceModule(relative, mocks) {
  const filename = path.join(base, relative);
  const before = execFileSync('git', ['show', `5147578:${relative}`], { cwd: base, encoding: 'utf8' });
  const code = ts.transpileModule(before, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, console, process,
    setTimeout, clearTimeout,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      if (name === 'react') return React;
      throw new Error(`Unmocked dependency: ${name}`);
    },
  };
  vm.runInNewContext(code, context, { filename });
  return module.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function renderer() {
  let priority = 0;
  const noop = () => {};
  const hostContext = {};
  const reconciler = Reconciler({
    rendererVersion: 'diagnostic', rendererPackageName: 'cyg-offline-probe',
    isPrimaryRenderer: false, supportsMutation: true,
    supportsPersistence: false, supportsHydration: false,
    getPublicInstance: value => value,
    getRootHostContext: () => hostContext,
    getChildHostContext: () => hostContext,
    prepareForCommit: () => null, resetAfterCommit: noop,
    createInstance: () => ({}), createTextInstance: value => ({ value }),
    appendInitialChild: noop, finalizeInitialChildren: () => false,
    shouldSetTextContent: () => false,
    scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
    setCurrentUpdatePriority: value => { priority = value; },
    getCurrentUpdatePriority: () => priority,
    resolveUpdatePriority: () => priority || DefaultEventPriority,
    shouldAttemptEagerTransition: () => false,
    maySuspendCommit: () => false, preloadInstance: () => true,
    startSuspendingCommit: noop, suspendInstance: noop,
    waitForCommitToBeReady: () => null,
    NotPendingTransition: null, HostTransitionContext: React.createContext(null),
    supportsMicrotasks: true, scheduleMicrotask: queueMicrotask,
    appendChild: noop, appendChildToContainer: noop,
    insertBefore: noop, insertInContainerBefore: noop,
    removeChild: noop, removeChildFromContainer: noop,
    commitUpdate: noop, commitTextUpdate: noop, clearContainer: noop,
    detachDeletedInstance: noop,
  });
  const fail = error => { throw error; };
  const root = reconciler.createContainer({}, ConcurrentRoot, null, false, null, '', fail, fail, fail, null);
  return {
    async render(element) {
      await React.act(async () => { reconciler.updateContainer(element, root, null, null); });
    },
    async dispose() {
      await React.act(async () => { reconciler.updateContainer(null, root, null, null); });
    },
  };
}

function stats(id, count = 0) {
  return {
    id: `stats-${id}`, user_id: id, questions_today: count,
    total_score: 0, total_questions: count, current_streak: 0,
    longest_streak: 0, country: null,
  };
}

async function gameHarness() {
  let currentUser = { id: 'A', username: 'fixture-A' };
  let value;
  const storage = new Map();
  const profile = {
    getOrCreateUserStats: async id => stats(id),
    updateUserStats: async () => {}, updateCategoryScore: async () => {},
    awardBadge: async () => {}, getUserBadges: async () => [],
    saveUserCountry: async () => {},
  };
  const ai = {
    generateQuestion: async () => ({ type: 'trivia', question: 'Synthetic diagnostic fixture?', correctAnswer: 'fixture' }),
    evaluateTrivia: async () => ({ isCorrect: true, score: 100, correctAnswer: 'fixture', explanation: 'Synthetic only' }),
    evaluateEstimation: async () => ({ score: 50, deviationPercent: 20 }),
  };
  const provider = sourceModule('contexts/GameContext.tsx', {
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, item) => { storage.set(key, item); },
    },
    '@/template': { useAuth: () => ({ user: currentUser }) },
    '@/hooks/useSubscriptionStatus': { useSubscriptionStatus: () => ({ isPaid: false }) },
    '@/services/aiService': ai,
    '@/services/profileService': profile,
    '@/hooks/useUserCountry': { detectCountryByIP: async () => null },
    '@/services/adService': { showRewardedAd: async () => true },
    '@/constants/config': { APP_CONFIG: { dailyFreeQuestions: 15 }, AD_CONFIG: { maxDailyBonusQuestions: 3 }, CATEGORIES: [] },
  });
  function Probe() { value = React.useContext(provider.GameContext); return null; }
  const view = renderer();
  const render = () => view.render(React.createElement(provider.GameProvider, null, React.createElement(Probe)));
  await render();
  return {
    get value() { return value; }, profile, ai, storage,
    async switchUser(id) { currentUser = id ? { id, username: `fixture-${id}` } : null; await render(); },
    async call(name, ...args) { await React.act(async () => { await value[name](...args); }); },
    dispose: () => view.dispose(),
  };
}

async function main() {
  const h = await gameHarness();
  await h.call('loadUserData');
  await h.call('startNewQuestion', 'world');
  await h.call('submitAnswer', 'answer-from-account-A');
  assert.equal(h.value.phase, 'result');
  assert.equal(h.value.currentResult.userAnswer, 'answer-from-account-A');
  await h.switchUser(null);
  assert.equal(h.value.currentResult.userAnswer, 'answer-from-account-A');
  await h.switchUser('B');
  await h.call('loadUserData');
  assert.equal(h.value.userStats.user_id, 'B');
  assert.equal(h.value.currentResult.userAnswer, 'answer-from-account-A');
  logs.push({ case: 'A result -> logout -> B + B data reload', phase: h.value.phase, statsOwner: h.value.userStats.user_id, visibleAnswer: h.value.currentResult.userAnswer, defectReproduced: true });

  await h.switchUser('A');
  await h.call('setConsentGiven', true);
  await h.call('watchAdForBonusQuestion');
  await h.switchUser('B');
  await h.call('loadUserData');
  assert.equal(h.value.bonusQuestionsEarned, 1);
  assert.equal(h.value.consentGiven, true);
  logs.push({ case: 'A bonus/AI consent -> B', bonusB: h.value.bonusQuestionsEarned, aiConsentB: h.value.consentGiven, defectReproduced: true });

  h.profile.getOrCreateUserStats = async id => id === 'A' ? stats('A', 12) : null;
  await h.switchUser('A');
  await h.call('loadUserData');
  await h.switchUser('B');
  await h.call('loadUserData');
  assert.equal(h.value.userStats.user_id, 'A');
  assert.equal(h.value.questionsToday, 12);
  logs.push({ case: 'B stats fetch unavailable', statsOwnerB: h.value.userStats.user_id, questionsTodayB: h.value.questionsToday, defectReproduced: true });
  await h.dispose();

  const pendingStats = await gameHarness();
  const statsGate = deferred();
  pendingStats.profile.getOrCreateUserStats = async id => id === 'A' ? statsGate.promise : stats('B');
  let loadA;
  await React.act(async () => { loadA = pendingStats.value.loadUserData(); await Promise.resolve(); await Promise.resolve(); });
  await pendingStats.switchUser('B');
  await pendingStats.call('loadUserData');
  assert.equal(pendingStats.value.userStats.user_id, 'B');
  await React.act(async () => { statsGate.resolve(stats('A', 9)); await loadA; });
  assert.equal(pendingStats.value.userStats.user_id, 'A');
  logs.push({ case: 'Late A stats after B reload', statsOwnerB: pendingStats.value.userStats.user_id, questionsTodayB: pendingStats.value.questionsToday, defectReproduced: true });
  await pendingStats.dispose();

  const pendingQuestion = await gameHarness();
  const questionGate = deferred();
  pendingQuestion.ai.generateQuestion = async () => questionGate.promise;
  let generationA;
  await React.act(async () => { generationA = pendingQuestion.value.startNewQuestion('world'); });
  await pendingQuestion.switchUser('B');
  await React.act(async () => { questionGate.resolve({ type: 'trivia', question: 'A pending fixture?', correctAnswer: 'fixture' }); await generationA; });
  assert.equal(pendingQuestion.value.currentQuestion.question, 'A pending fixture?');
  logs.push({ case: 'Late A generation after B login', phaseB: pendingQuestion.value.phase, questionB: pendingQuestion.value.currentQuestion.question, defectReproduced: true });
  await pendingQuestion.dispose();

  let subscriptionUser = { id: 'A' };
  let subscriptionValue;
  const paidA = deferred();
  let paidCalls = 0;
  const subscriptions = sourceModule('contexts/SubscriptionContext.tsx', {
    '@/template': { useAuth: () => ({ user: subscriptionUser }) },
    '@/services/purchasesService': { checkIsSubscribed: async () => ++paidCalls === 1 ? paidA.promise : false },
  });
  function PaidProbe() { subscriptionValue = React.useContext(subscriptions.SubscriptionContext); return null; }
  const paidView = renderer();
  const renderPaid = () => paidView.render(React.createElement(subscriptions.SubscriptionProvider, null, React.createElement(PaidProbe)));
  await renderPaid();
  subscriptionUser = { id: 'B' };
  await renderPaid();
  assert.equal(subscriptionValue.isPaid, false);
  await React.act(async () => { paidA.resolve(true); await paidA.promise; });
  assert.equal(subscriptionValue.isPaid, true);
  logs.push({ case: 'Late A entitlement refresh after B refresh', isPaidB: subscriptionValue.isPaid, defectReproduced: true, note: 'Controlled JS race; not a real RevenueCat transfer test' });
  await paidView.dispose();

  const configureGate = deferred();
  const nativeCalls = [];
  const purchases = sourceModule('services/purchasesService.ts', {
    '@/constants/config': { APP_CONFIG: { revenueCatKey: 'synthetic-public-key', premiumEntitlementId: 'fixture' } },
    'react-native-purchases': {
      LOG_LEVEL: { ERROR: 'ERROR' },
      default: { setLogLevel() {}, configure: async () => configureGate.promise,
        logIn: async id => { nativeCalls.push(id); }, logOut: async () => {} },
    },
  });
  const init = purchases.initializePurchases();
  await purchases.loginPurchasesUser('A');
  configureGate.resolve();
  await init;
  assert.equal(nativeCalls.length, 0);
  logs.push({ case: 'Auth identity sync before SDK initialization completes', nativeLogInCalls: nativeCalls.length, defectReproduced: true, note: 'Service drops sync; no queue/retry' });

  console.log(JSON.stringify({ kind: 'offline-source-reproduction', react: React.version, networkCalls: 0, aiSpendUSD: 0, results: logs }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
