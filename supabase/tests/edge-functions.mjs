import assert from 'node:assert/strict';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;
const accessToken = process.env.TEST_USER_ACCESS_TOKEN;
const runAi = process.env.RUN_AI_INTEGRATION === '1';
const runDelete = process.env.RUN_DELETE_INTEGRATION === '1';

if (!supabaseUrl || !anonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY before running this test.');
  process.exit(2);
}

const generateEndpoint = `${supabaseUrl}/functions/v1/generate-question`;
const deleteEndpoint = `${supabaseUrl}/functions/v1/delete-account`;

async function invoke(endpoint, body, token = accessToken, method = 'POST') {
  const response = await fetch(endpoint, {
    method,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
}

const invokeGenerate = (body, token = accessToken, method = 'POST') =>
  invoke(generateEndpoint, body, token, method);
const invokeDelete = (body, token = accessToken, method = 'POST') =>
  invoke(deleteEndpoint, body, token, method);

const unauthenticated = await invokeGenerate({ action: 'generate', category: 'world' }, null);
assert.equal(unauthenticated.response.status, 401, 'unauthenticated requests must be rejected');
console.log('ok - unauthenticated generation rejected');

const unauthenticatedDelete = await invokeDelete({ confirm: 'DELETE' }, null);
assert.equal(unauthenticatedDelete.response.status, 401, 'unauthenticated deletion must be rejected');
console.log('ok - unauthenticated deletion rejected');

if (!accessToken) {
  console.log('skip - set TEST_USER_ACCESS_TOKEN for authenticated checks');
  process.exit(0);
}

const wrongMethod = await invokeGenerate(null, accessToken, 'GET');
assert.equal(wrongMethod.response.status, 405, 'only POST should be accepted');
console.log('ok - generation GET rejected');

const unknownAction = await invokeGenerate({ action: 'not-real' });
assert.equal(unknownAction.response.status, 400, 'unknown action should be rejected');
console.log('ok - unknown action rejected');

const oversized = await invokeGenerate({ action: 'generate', category: 'world', country: 'x'.repeat(17_000) });
assert.equal(oversized.response.status, 413, 'oversized JSON should be rejected');
console.log('ok - oversized generation body rejected');

const deleteWrongMethod = await invokeDelete(null, accessToken, 'GET');
assert.equal(deleteWrongMethod.response.status, 405, 'account deletion should only accept POST');
console.log('ok - deletion GET rejected');

const missingConfirmation = await invokeDelete({ confirm: 'not-delete' });
assert.equal(missingConfirmation.response.status, 400, 'account deletion must require explicit confirmation');
console.log('ok - deletion without confirmation rejected');

const oversizedDelete = await invokeDelete({ confirm: 'x'.repeat(2_000) });
assert.equal(oversizedDelete.response.status, 413, 'oversized account deletion JSON should be rejected');
console.log('ok - oversized deletion body rejected');

async function deleteTestAccount() {
  const deleted = await invokeDelete({ confirm: 'DELETE' });
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.data));
  assert.equal(deleted.data?.success, true, 'account deletion must report success');
  console.log('ok - authenticated account deletion succeeded');
}

if (!runAi) {
  console.log('skip - set RUN_AI_INTEGRATION=1 to run the paid Gemini/session flow');
  if (runDelete) {
    await deleteTestAccount();
  } else {
    console.log('skip - set RUN_DELETE_INTEGRATION=1 with a disposable user to test account deletion');
  }
  process.exit(0);
}

const generated = await invokeGenerate({
  action: 'generate',
  requestId: crypto.randomUUID(),
  category: 'world',
  country: 'World',
  questionTypePreference: 'trivia',
  recentTopics: [],
});
assert.equal(generated.response.status, 200, JSON.stringify(generated.data));
assert.equal(typeof generated.data?.questionId, 'string');
assert.equal(generated.data?.type, 'trivia');
assert.equal('correctAnswer' in generated.data, false, 'generation must not disclose the answer');
console.log('ok - authenticated generation created a private session');

const evaluationRequest = {
  action: 'evaluate_trivia',
  questionId: generated.data.questionId,
  userAnswer: 'integration-test answer',
};
const evaluationAttempts = await Promise.all([
  invokeGenerate(evaluationRequest),
  invokeGenerate(evaluationRequest),
]);
const evaluated = evaluationAttempts.find(({ response }) => response.status === 200);
const rejectedConcurrent = evaluationAttempts.find(({ response }) => response.status === 409);
assert.ok(evaluated, JSON.stringify(evaluationAttempts.map(({ response, data }) => [response.status, data])));
assert.ok(rejectedConcurrent, 'one concurrent evaluation must be rejected');
assert.ok(evaluated.data?.score === 0 || evaluated.data?.score === 100);
assert.equal(typeof evaluated.data?.stats?.total_score, 'number');
console.log('ok - one evaluation finalized and the concurrent attempt was rejected');

const replay = await invokeGenerate({
  action: 'evaluate_trivia',
  questionId: generated.data.questionId,
  userAnswer: 'second attempt',
});
assert.equal(replay.response.status, 409, 'a finalized session must reject replay');
console.log('ok - score replay rejected');

if (runDelete) {
  await deleteTestAccount();
} else {
  console.log('skip - set RUN_DELETE_INTEGRATION=1 with a disposable user to test account deletion');
}
