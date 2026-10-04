/**
 * Offline diagnostic: execute the real provider/service source with React 19
 * and the installed reconciler; stub native/storage/network boundaries only.
 * No Supabase calls, AI calls, native SDK calls or production edits.
 * Fixtures below are synthetic, NOT an AI question-quality corpus.
 * Run: node scripts/diagnostics/identity-regression.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
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
    setTimeout, clearTimeout, fetch: (...args) => global.fetch(...args), AbortController,
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
  let currentUser={id:'A'}; let value;
  const identity=sourceModule('services/identityScope.ts',{});
  identity.setIdentity('A');
  const storage=new Map();
  const cache=sourceModule('services/userCache.ts',{'./identityScope':identity,
    '@react-native-async-storage/async-storage':{
      getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}});
  const state=()=>({questions_today:0,free_limit:15,bonus_remaining:0,paid:false,can_play:true,
    reset_at:'2099-01-01T00:00:00Z',server_now:new Date().toISOString()});
  const profile={getOrCreateUserStats:async id=>stats(id),getUserBadges:async()=>[]};
  const ai={getPlayState:async()=>state(),generateQuestion:async()=>({questionId:'fixture-id',type:'trivia',question:'Synthetic fixture?',unit:''}),
    evaluateTrivia:async()=>({isCorrect:true,score:100,stats:{new_badges:[]}})};
  const provider=sourceModule('contexts/GameContext.tsx',{'@/template':{useAuth:()=>({user:currentUser})},
    '@/services/ownedBackend':{ownedRpc:async()=>{}},
    '@/services/identityScope':identity,'@/services/userCache':cache,'@/services/aiService':ai,
    '@/services/profileService':profile,'@/constants/config':{CATEGORIES:[]}});
  function Probe(){value=React.useContext(provider.GameContext);return null;}
  const view=renderer();
  const render=()=>view.render(React.createElement(provider.GameProvider,null,React.createElement(Probe)));
  await render();
  return {identity,storage,cache,profile,ai,get value(){return value;},
    async switchUser(id){await React.act(async()=>{identity.setIdentity(id);currentUser=id?{id}:null;});await render();},
    async call(name,...args){await React.act(async()=>{await value[name](...args);});},
    dispose:()=>view.dispose()};
}
async function main(){
  const h=await gameHarness();
  await h.call('loadUserData');await h.call('setConsentGiven',true);
  await h.call('startNewQuestion','world');await h.call('submitAnswer','A answer');
  assert.equal(h.value.currentResult.userAnswer,'A answer');
  await h.switchUser(null);
  assert.equal(h.value.currentResult,null);assert.equal(h.value.currentQuestion,null);
  await h.switchUser('B');await h.call('loadUserData');
  assert.equal(h.value.currentResult,null);assert.equal(h.value.userStats.user_id,'B');
  assert.equal(h.value.consentGiven,null);assert.equal(h.value.bonusQuestionsEarned,0);
  assert.equal(await h.value.watchAdForBonusQuestion(),false);
  logs.push({case:'A result/consent -> logout -> B',passed:true});
  h.profile.getOrCreateUserStats=async()=>null;
  await h.call('loadUserData');assert.equal(h.value.userStats,null);
  logs.push({case:'Missing B stats fail closed without A reuse',passed:true});
  await h.dispose();

  for(const pending of ['stats','generation','evaluation']){
    const race=await gameHarness();await race.call('loadUserData');await race.call('setConsentGiven',true);
    const gate=deferred();let work;
    if(pending==='stats')race.profile.getOrCreateUserStats=async id=>id==='A'?gate.promise:stats('B');
    if(pending==='generation')race.ai.generateQuestion=async()=>gate.promise;
    if(pending==='evaluation'){await race.call('startNewQuestion','world');race.ai.evaluateTrivia=async()=>gate.promise;}
    await React.act(async()=>{work=race.value[pending==='stats'?'loadUserData':pending==='generation'?'startNewQuestion':'submitAnswer']('world');});
    await race.switchUser('B');await race.call('loadUserData');
    await React.act(async()=>{gate.resolve(pending==='stats'?stats('A',12):pending==='generation'
      ?{questionId:'A-q',type:'trivia',question:'A late question',unit:''}:{score:100,stats:{}});await work;});
    assert.equal(race.value.currentResult,null);assert.equal(race.value.currentQuestion,null);
    assert.equal(race.value.userStats.user_id,'B');assert.equal(race.value.questionsToday,0);
    logs.push({case:'Late A '+pending+' rejected after B',passed:true});await race.dispose();
  }
  const identity=sourceModule('services/identityScope.ts',{});
  identity.setIdentity('A');const a=identity.captureIdentity();
  const cacheKeyA=identity.userCacheKey(a,'history');
  assert.notEqual(cacheKeyA,identity.userCacheKey({...a,project:'https://another-project.invalid'},'history'));
  identity.setIdentity('B');assert.throws(()=>identity.assertCurrentIdentity(a));
  identity.setIdentity('A');assert.throws(()=>identity.assertCurrentIdentity(a)); // Same UID, new generation.
  logs.push({case:'UID + project + generation ownership',passed:true});

  const configGate=deferred(),calls=[];let sdkUid;
  const purchases=sourceModule('services/purchasesService.ts',{'./identityScope':identity,
    '@/constants/config':{APP_CONFIG:{revenueCatKey:'synthetic',premiumEntitlementId:'paid'}},
    'react-native-purchases':{LOG_LEVEL:{ERROR:'ERROR'},default:{
      setLogLevel(){},configure:async options=>{calls.push('configure');await configGate.promise;sdkUid=options.appUserID;},
      logIn:async uid=>{calls.push('login:'+uid);sdkUid=uid;},getAppUserID:async()=>sdkUid,
      getCustomerInfo:async()=>{calls.push('info:'+sdkUid);return{entitlements:{active:{}}};},logOut:async()=>{sdkUid=null;}}}});
  const pendingA=purchases.loginPurchasesUser('A').then(()=>null,e=>e);
  await new Promise(setImmediate);
  identity.setIdentity('B');const pendingB=purchases.getCustomerInfo();
  configGate.resolve();assert.ok(await pendingA instanceof identity.StaleIdentityError);await pendingB;
  assert.deepEqual(calls,['configure','login:B','info:B']);
  logs.push({case:'RevenueCat waits for configure, rejects stale A, syncs B before refresh',passed:true});

  const jwtIdentity=sourceModule('services/identityScope.ts',{});jwtIdentity.setIdentity('A');
  const sessionGate=deferred();let requestHeaders=null;
  const backend=sourceModule('services/ownedBackend.ts',{'./identityScope':jwtIdentity,
    '@/template':{getSupabaseClient:()=>({auth:{getSession:async()=>sessionGate.promise}})}});
  global.fetch=async(url,options)=>{requestHeaders=options.headers;return{ok:true,json:async()=>({})};};
  const stale=backend.ownedRequest('/test').then(()=>null,e=>e);
  jwtIdentity.setIdentity('B');sessionGate.resolve({data:{session:{user:{id:'A'},access_token:'fixture-A'}},error:null});
  assert.ok(await stale instanceof jwtIdentity.StaleIdentityError);assert.equal(requestHeaders,null);
  logs.push({case:'Auth session changing while JWT is read never dispatches',passed:true});
  const scopeB=jwtIdentity.captureIdentity();const responseGate=deferred();
  const pinned=sourceModule('services/ownedBackend.ts',{'./identityScope':jwtIdentity,
    '@/template':{getSupabaseClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'B'},access_token:'fixture-B'}},error:null})}})}});
  global.fetch=async(url,options)=>{requestHeaders=options.headers;return responseGate.promise;};
  const response=pinned.ownedRequest('/test',{},scopeB).then(()=>null,e=>e);
  await new Promise(setImmediate);
  assert.equal(requestHeaders.Authorization,'Bearer fixture-B');
  jwtIdentity.setIdentity('A');responseGate.resolve({ok:true,json:async()=>({owner:'B'})});
  assert.ok(await response instanceof jwtIdentity.StaleIdentityError);
  logs.push({case:'Pinned owner JWT and stale HTTP response rejection',passed:true});

  const cacheIdentity=sourceModule('services/identityScope.ts',{});cacheIdentity.setIdentity('A');
  const cacheOwner=cacheIdentity.captureIdentity(),cacheGate=deferred(),disk=new Map();
  const cache=sourceModule('services/userCache.ts',{'./identityScope':cacheIdentity,
    '@react-native-async-storage/async-storage':{getItem:async k=>disk.get(k)??null,
      setItem:async(k,v)=>{await cacheGate.promise;disk.set(k,v);},removeItem:async k=>disk.delete(k)}});
  const oldWrite=cache.writeUserCache(cacheOwner,'question-history',['A']).then(()=>null,e=>e);
  await new Promise(setImmediate);cacheIdentity.setIdentity('B');
  assert.equal(await cache.readUserCache(cacheIdentity.captureIdentity(),'question-history'),null);
  const clearing=cache.clearUserCaches(cacheOwner);cacheGate.resolve();
  assert.ok(await oldWrite instanceof cacheIdentity.StaleIdentityError);await clearing;
  assert.equal(disk.size,0);
  logs.push({case:'User cache isolation; logout clear serializes after an already-running A write',passed:true});

  let subUser={id:'A'},subValue,unknown=false;const paidGate=deferred();
  const subIdentity=sourceModule('services/identityScope.ts',{});subIdentity.setIdentity('A');
  const sub=sourceModule('contexts/SubscriptionContext.tsx',{'@/template':{useAuth:()=>({user:subUser})},
    '@/services/identityScope':subIdentity,'@/services/purchasesService':{loginPurchasesUser:async()=>{},logoutPurchasesUser:async()=>{},
      checkIsSubscribed:async()=>{if(unknown)throw new Error('Offline');return subUser.id==='A'?paidGate.promise:false;}}});
  function SubProbe(){subValue=React.useContext(sub.SubscriptionContext);return null;}
  const subView=renderer();
  const renderSub=()=>subView.render(React.createElement(sub.SubscriptionProvider,null,React.createElement(SubProbe)));
  await renderSub();assert.equal(subValue.status,'unknown');
  await React.act(async()=>{subIdentity.setIdentity('B');subUser={id:'B'};});await renderSub();
  assert.equal(subValue.status,'free');
  await React.act(async()=>{paidGate.resolve(true);await new Promise(setImmediate);});
  assert.equal(subValue.isPaid,false);assert.equal(subValue.status,'free');
  unknown=true;await React.act(async()=>{await subValue.refreshPurchase();});
  assert.equal(subValue.status,'unknown');assert.equal(subValue.isPaid,false);await subView.dispose();
  logs.push({case:'Late A paid result rejected; offline B refresh remains unknown, never paid',passed:true});

  const scored=await gameHarness();await scored.call('loadUserData');await scored.call('setConsentGiven',true);
  await scored.call('startNewQuestion','world');
  scored.profile.getOrCreateUserStats=async()=>{throw new Error('Offline refresh');};
  scored.profile.getUserBadges=async()=>{throw new Error('Offline refresh');};
  scored.ai.getPlayState=async()=>{throw new Error('Offline refresh');};
  await scored.call('submitAnswer','A answer');
  assert.equal(scored.value.phase,'result');assert.equal(scored.value.currentResult.score,100);
  assert.equal(scored.value.userStats,null);assert.equal(scored.value.canPlayToday(),false);await scored.dispose();
  logs.push({case:'Committed evaluation survives failed follow-up reads; no offline allowance grant',passed:true});
  console.log(JSON.stringify({kind:'offline-identity-regression',networkCalls:0,aiSpendUSD:0,results:logs},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
