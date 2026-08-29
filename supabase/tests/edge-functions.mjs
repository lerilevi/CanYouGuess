import assert from 'node:assert/strict';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;
const accessToken = process.env.TEST_USER_ACCESS_TOKEN;
const runAi = process.env.RUN_AI_INTEGRATION === '1';

if (!supabaseUrl || !anonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY before running this test.');
  process.exit(2);
}

const endpoint = `${supabaseUrl}/functions/v1/generate-question`;

async function invoke(body, token = accessToken, method = 'POST') {
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

const unauthenticated = await invoke({ action: 'generate', category: 'world' }, null);
assert.equal(unauthenticated.response.status, 401, 'unauthenticated requests must be rejected');
console.log('ok - unauthenticated request rejected');

if (!accessToken) {
  console.log('skip - set TEST_USER_ACCESS_TOKEN for authenticated checks');
  process.exit(0);
}

const wrongMethod = await invoke(null, accessToken, 'GET');
assert.equal(wrongMethod.response.status, 405, 'only POST should be accepted');
console.log('ok - GET rejected');

const unknownAction = await invoke({ action: 'not-real' });
assert.equal(unknownAction.response.status, 400, 'unknown action should be rejected');
console.log('ok - unknown action rejected');

const oversized = await invoke({ action: 'generate', category: 'world', country: 'x'.repeat(17_000) });
assert.equal(oversized.response.status, 413, 'oversized JSON should be rejected');
console.log('ok - oversized body rejected');

if (!runAi) {
  console.log('skip - set RUN_AI_INTEGRATION=1 to run the paid Gemini/session flow');
  process.exit(0);
}

const generated = await invoke({
  action: 'generate',
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
  invoke(evaluationRequest),
  invoke(evaluationRequest),
]);
const evaluated = evaluationAttempts.find(({ response }) => response.status === 200);
const rejectedConcurrent = evaluationAttempts.find(({ response }) => response.status === 409);
assert.ok(evaluated, JSON.stringify(evaluationAttempts.map(({ response, data }) => [response.status, data])));
assert.ok(rejectedConcurrent, 'one concurrent evaluation must be rejected');
assert.ok(evaluated.data?.score === 0 || evaluated.data?.score === 100);
assert.equal(typeof evaluated.data?.stats?.total_score, 'number');
console.log('ok - one evaluation finalized and the concurrent attempt was rejected');

const replay = await invoke({
  action: 'evaluate_trivia',
  questionId: generated.data.questionId,
  userAnswer: 'second attempt',
});
assert.equal(replay.response.status, 409, 'a finalized session must reject replay');
console.log('ok - score replay rejected');
