// Authenticated, rate-limited Gemini gateway with server-authoritative scoring.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders } from '../_shared/cors.ts';

const SYSTEM_PROMPT = `You are a trivia/estimation game engine for "Can You Guess?". Generate fun questions and evaluate answers.
Types: ESTIMATION (Fermi-style numeric guesses) and TRIVIA (factual, one correct answer).
Rules: English only, match category, no offensive content, brief explanations.
QUESTION LENGTH: MUST be 8-14 words maximum. Short, punchy, direct. No lengthy preambles.
Respond with valid JSON only — no markdown, no extra text.`;

const TOPIC_WHEEL = [
  'ancient civilizations', 'space exploration', 'deep ocean life', 'human anatomy', 'bizarre world records',
  'food science and nutrition', 'famous inventors', 'extreme weather events', 'animal migration patterns', 'architectural wonders',
  'music history', 'olympic sports records', 'endangered species', 'viral diseases and vaccines', 'chemical elements and reactions',
  'economic history', 'film and cinema history', 'mountain ranges and peaks', 'rivers and lakes', 'famous wars and battles',
  'plant biology and botany', 'renewable energy sources', 'language and linguistics', 'chess and strategy games', 'famous artworks and artists',
  'volcanoes and earthquakes', 'aviation and flight history', 'famous scientists and discoveries', 'currency and trade history', 'mythology and legends',
  'genetics and DNA', 'bridges and engineering marvels', 'street food around the world', 'famous athletes and sports achievements', 'typography and writing systems',
  'medieval history and knights', 'fishing and aquaculture', 'famous libraries and books', 'psychology and human behavior', 'astronomy and planetary science',
  'amphibians reptiles and cold-blooded animals', 'fermentation wine and brewing', 'transportation and vehicle history', 'famous explorers and expeditions', 'martial arts and combat sports',
  'nanotechnology and materials science', 'insects and arachnids', 'famous speeches and rhetoric', 'cryptography and codes', 'traditional clothing and fashion history',
];

const ALLOWED_CATEGORIES = new Set([
  'my_country', 'world', 'science', 'history', 'food_drink', 'sports', 'art',
]);
const GENERATE_PREFERENCES = new Set(['mix', 'trivia', 'estimation']);
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.7-flash';
const configuredThinkingLevel = (Deno.env.get('GEMINI_THINKING_LEVEL') ?? 'LOW').toUpperCase();
const THINKING_LEVEL = new Set(['LOW', 'MEDIUM', 'HIGH']).has(configuredThinkingLevel)
  ? configuredThinkingLevel
  : 'LOW';
const configuredTimeout = Number(Deno.env.get('GEMINI_TIMEOUT_MS') ?? '20000');
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout)
  ? Math.min(Math.max(configuredTimeout, 5_000), 60_000)
  : 20_000;
const MAX_REQUEST_BYTES = 16_384;

const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['trivia', 'estimation'] },
    question: { type: 'string' },
    hint: { type: 'string' },
    correctAnswer: { type: 'string' },
    acceptableAnswers: { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
  required: ['type', 'question', 'hint', 'correctAnswer', 'acceptableAnswers'],
};

const ESTIMATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    estimatedAnswer: { type: 'number' },
    unit: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['estimatedAnswer', 'unit', 'steps'],
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface QuestionSession {
  id: string;
  question_type: 'trivia' | 'estimation';
  question: string;
  correct_answer: string;
  acceptable_answers: string[];
  evaluation_token: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function boundedString(value: unknown, name: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string`);
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > maxLength || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new HttpError(400, `${name} is invalid`);
  }
  return trimmed;
}

function parseObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini returned a non-object JSON value');
  }
  return parsed as Record<string, unknown>;
}

async function readJsonBody(req: Request): Promise<unknown> {
  if (!req.body) throw new HttpError(400, 'Request body is required');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'Request body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeAnswer(text);
  const normalizedPhrase = normalizeAnswer(phrase);
  return Boolean(normalizedPhrase)
    && ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function matchesAcceptedAnswer(userAnswer: string, acceptedAnswers: string[]): boolean {
  const candidate = normalizeAnswer(userAnswer);
  return acceptedAnswers.some((answer) => {
    const expected = normalizeAnswer(answer);
    if (!candidate || !expected) return false;
    if (candidate === expected) return true;
    const tolerance = expected.length >= 12 ? 2 : expected.length >= 6 ? 1 : 0;
    return Math.abs(candidate.length - expected.length) <= tolerance
      && editDistance(candidate, expected) <= tolerance;
  });
}

function generatePrompt(
  category: string,
  country: string,
  seed: string,
  questionTypePreference: string,
  recentTopics: string[],
): string {
  const seedNum = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const typeInstruction = questionTypePreference === 'estimation'
    ? 'MUST be ESTIMATION (a numeric Fermi-style guess). Not trivia.'
    : questionTypePreference === 'trivia'
    ? 'MUST be TRIVIA (one clear factual answer). Not estimation.'
    : `Seed sum is ${seedNum % 2 === 0 ? 'even → use estimation' : 'odd → use trivia'}.`;
  const forcedTheme = TOPIC_WHEEL[seedNum % TOPIC_WHEEL.length];
  const isCountry = category === 'my_country';
  const resolvedCountry = country !== 'World' && country !== 'Unknown' ? country : null;
  const locationRule = isCountry && resolvedCountry
    ? `CATEGORY: "My Country" = ${resolvedCountry}. The question MUST name and concern ${resolvedCountry}.`
    : isCountry
    ? 'CATEGORY: "My Country" (country unknown). Generate a country-themed question.'
    : `CATEGORY: "${category}". General world knowledge only.`;
  const theme = !isCountry || !resolvedCountry
    ? `THEME (MANDATORY): Relate clearly to "${forcedTheme}".`
    : '';
  const recent = recentTopics.length
    ? `BANNED TOPICS: ${recentTopics.join(' | ')}.`
    : '';

  return `Generate ONE question. Seed: ${seed}
${recent}
${theme}
${locationRule}
Type: ${typeInstruction}
LENGTH: Question MUST be 8-14 words. Count words.
Avoid clichés such as the Mona Lisa, capital cities, speed of light, and the Great Wall.
JSON only:
{"type":"estimation"or"trivia","question":"...","hint":"max 8 words or empty","correctAnswer":"primary trivia answer or empty","acceptableAnswers":["primary answer","up to 5 factual aliases"]}`;
}

function estimationPrompt(question: string, userAnswer: number): string {
  return `Q: "${question}"
User estimate: ${userAnswer}
Determine the best-supported numeric answer. JSON only:
{"estimatedAnswer":<number>,"unit":"<unit>","steps":["<step1>","<step2>","<step3>"]}`;
}

function scoreFromDeviation(deviation: number): number {
  if (deviation <= 0) return 100;
  if (deviation <= 1) return Math.round(100 - deviation);
  if (deviation <= 5) return Math.round(99 - (deviation - 1) * 2.25);
  if (deviation <= 20) return Math.round(90 - (deviation - 5) * (20 / 15));
  if (deviation <= 50) return Math.round(70 - (deviation - 20));
  if (deviation <= 100) return Math.round(40 - (deviation - 50) * 0.4);
  return Math.max(0, Math.round(20 - Math.min(deviation - 100, 100) * 0.2));
}

function verdictForScore(score: number): string {
  if (score >= 95) return 'Spot On!';
  if (score >= 70) return 'Pretty Close!';
  if (score >= 40) return 'Nice Try!';
  return 'Way Off!';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Request body too large' }, 413);
  }

  let activeClaim: { userId: string; sessionId: string; token: string } | null = null;
  let releaseActiveClaim: (() => Promise<void>) | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('[generate-question] Missing required server environment variables.');
      return json({ error: 'Server misconfigured' }, 500);
    }
    if (!/^[a-z0-9._-]{1,80}$/i.test(model)) {
      console.error('[generate-question] Invalid GEMINI_MODEL configuration.');
      return json({ error: 'Server misconfigured' }, 500);
    }

    const token = authHeader.slice('Bearer '.length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) throw new HttpError(401, 'Invalid or expired session');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    releaseActiveClaim = async () => {
      if (!activeClaim) return;
      const claimToRelease = activeClaim;
      const { error: releaseError } = await adminClient.rpc('release_question_session_claim', {
        p_user_id: claimToRelease.userId,
        p_session_id: claimToRelease.sessionId,
        p_evaluation_token: claimToRelease.token,
      });
      if (releaseError) {
        console.error('[generate-question] Could not release evaluation claim:', releaseError.message);
      }
    };

    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Request body must be a JSON object');
    }
    const input = body as Record<string, unknown>;
    const action = boundedString(input.action, 'action', 32);

    const reserve = async (kind: 'generate' | 'evaluate') => {
      const { error } = await adminClient.rpc('reserve_ai_request', {
        p_user_id: user.id,
        p_action: kind,
      });
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) throw new HttpError(429, error.message);
        throw new Error(`Could not reserve AI request: ${error.message}`);
      }
    };

    const callGemini = async (
      prompt: string,
      responseJsonSchema: Record<string, unknown>,
      temperature: number,
    ): Promise<Record<string, unknown>> => {
      if (!geminiKey) {
        console.error('[generate-question] Missing GEMINI_API_KEY.');
        throw new HttpError(500, 'Server misconfigured');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              responseMimeType: 'application/json',
              responseJsonSchema,
              thinkingConfig: { thinkingLevel: THINKING_LEVEL },
            },
          }),
        });
        if (!response.ok) {
          console.error(`[generate-question] Gemini returned ${response.status}:`, (await response.text()).slice(0, 500));
          throw new Error('AI provider request failed');
        }
        const payload = await response.json();
        if (payload.promptFeedback?.blockReason) throw new HttpError(422, 'The AI provider blocked this request');
        const candidate = payload.candidates?.[0];
        if (!candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
          throw new Error('AI provider returned no complete candidate');
        }
        const text = (candidate.content?.parts ?? [])
          .map((part: { text?: string }) => part.text ?? '')
          .join('');
        if (!text.trim()) throw new Error('AI provider returned an empty response');
        return parseObject(text);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new HttpError(504, 'AI provider timed out');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };

    if (action === 'generate') {
      const category = boundedString(input.category ?? 'world', 'category', 32);
      if (!ALLOWED_CATEGORIES.has(category)) throw new HttpError(400, 'Unknown category');
      const country = boundedString(input.country ?? 'Unknown', 'country', 80);
      if (country !== 'World' && country !== 'Unknown' && !/^[\p{L}\p{M} .’'-]{2,80}$/u.test(country)) {
        throw new HttpError(400, 'country is invalid');
      }
      const preference = boundedString(input.questionTypePreference ?? 'mix', 'questionTypePreference', 16);
      if (!GENERATE_PREFERENCES.has(preference)) throw new HttpError(400, 'Invalid question type preference');
      const recentTopics = Array.isArray(input.recentTopics)
        ? input.recentTopics.slice(0, 10).map((topic, index) => boundedString(topic, `recentTopics[${index}]`, 100))
        : [];

      await reserve('generate');
      const seed = `${Date.now()}-${crypto.randomUUID()}`;
      const generated = await callGemini(
        generatePrompt(category, country, seed, preference, recentTopics),
        QUESTION_SCHEMA,
        1.1,
      );
      const type = boundedString(generated.type, 'generated type', 16) as 'trivia' | 'estimation';
      if (type !== 'trivia' && type !== 'estimation') throw new Error('Gemini returned an invalid question type');
      if (preference !== 'mix' && type !== preference) throw new Error('Gemini ignored the requested question type');
      const question = boundedString(generated.question, 'generated question', 300);
      const wordCount = question.split(/\s+/).length;
      if (wordCount < 8 || wordCount > 14) throw new Error('Gemini returned a question outside the 8-14 word limit');
      let hint = boundedString(generated.hint ?? '', 'generated hint', 100, true);
      const correctAnswer = boundedString(
        generated.correctAnswer ?? '',
        'generated correct answer',
        200,
        type === 'estimation',
      );
      const generatedAliases = Array.isArray(generated.acceptableAnswers)
        ? generated.acceptableAnswers
          .slice(0, 6)
          .map((answer, index) => boundedString(answer, `acceptableAnswers[${index}]`, 200))
        : [];
      const acceptableAnswers: string[] = [];
      const normalizedAliases = new Set<string>();
      if (type === 'trivia') {
        for (const answer of [correctAnswer, ...generatedAliases]) {
          const normalized = normalizeAnswer(answer);
          if (normalized && !normalizedAliases.has(normalized)) {
            normalizedAliases.add(normalized);
            acceptableAnswers.push(answer);
          }
          if (acceptableAnswers.length === 6) break;
        }
        if (acceptableAnswers.some((answer) => containsNormalizedPhrase(question, answer))) {
          throw new Error('Gemini included the trivia answer in the question');
        }
        if (acceptableAnswers.some((answer) => containsNormalizedPhrase(hint, answer))) {
          hint = '';
        }
      }
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { data: questionId, error: sessionError } = await adminClient.rpc('create_question_session', {
        p_user_id: user.id,
        p_category: category,
        p_question_type: type,
        p_question: question,
        p_correct_answer: correctAnswer,
        p_acceptable_answers: acceptableAnswers,
        p_expires_at: expiresAt,
      });
      if (sessionError || typeof questionId !== 'string') {
        throw new Error(`Could not create question session: ${sessionError?.message ?? 'no id returned'}`);
      }

      return json({ questionId, type, question, hint, expiresAt });
    }

    if (action === 'evaluate_estimation' || action === 'evaluate_trivia') {
      const questionId = boundedString(input.questionId, 'questionId', 64);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
        throw new HttpError(400, 'questionId is invalid');
      }
      const expectedType = action === 'evaluate_estimation' ? 'estimation' : 'trivia';
      const estimationAnswer = expectedType === 'estimation'
        ? typeof input.userAnswer === 'number'
          ? input.userAnswer
          : Number(boundedString(input.userAnswer, 'userAnswer', 80))
        : null;
      const triviaAnswer = expectedType === 'trivia'
        ? boundedString(input.userAnswer, 'userAnswer', 200)
        : null;
      if (expectedType === 'estimation' && !Number.isFinite(estimationAnswer)) {
        throw new HttpError(400, 'userAnswer must be a finite number');
      }

      const { data: claimedRows, error: claimError } = await adminClient.rpc('claim_question_session', {
        p_user_id: user.id,
        p_session_id: questionId,
        p_question_type: expectedType,
      });
      if (claimError) {
        if (claimError.code === 'P0002') throw new HttpError(404, 'Question session not found');
        if (claimError.code === '23505') throw new HttpError(409, 'Question was already answered');
        if (claimError.code === '55P03') throw new HttpError(409, 'Question evaluation is already in progress');
        if (claimError.message.includes('expired')) throw new HttpError(410, 'Question expired');
        if (claimError.message.includes('does not match')) {
          throw new HttpError(400, 'Evaluation action does not match the question type');
        }
        throw new Error(`Could not claim question session: ${claimError.message}`);
      }
      const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
      if (!claimed || typeof claimed.evaluation_token !== 'string') {
        throw new Error('Question claim returned no evaluation token');
      }
      const questionSession = claimed as QuestionSession;
      activeClaim = {
        userId: user.id,
        sessionId: questionSession.id,
        token: questionSession.evaluation_token,
      };

      let result: Record<string, unknown>;
      let score: number;
      let deviation: number | null = null;

      if (questionSession.question_type === 'estimation') {
        await reserve('evaluate');
        const userAnswer = estimationAnswer as number;
        const evaluated = await callGemini(
          estimationPrompt(questionSession.question, userAnswer),
          ESTIMATION_SCHEMA,
          0.2,
        );
        const estimatedAnswer = Number(evaluated.estimatedAnswer);
        if (!Number.isFinite(estimatedAnswer)) throw new Error('Gemini returned an invalid estimated answer');
        deviation = Math.abs(userAnswer - estimatedAnswer) / Math.max(Math.abs(estimatedAnswer), 1) * 100;
        score = scoreFromDeviation(deviation);
        const unit = boundedString(evaluated.unit ?? '', 'unit', 80, true);
        const steps = Array.isArray(evaluated.steps)
          ? evaluated.steps.slice(0, 5).map((step, index) => boundedString(step, `steps[${index}]`, 240))
          : [];
        result = {
          estimatedAnswer,
          unit,
          steps,
          deviationPercent: deviation,
          score,
          verdict: verdictForScore(score),
        };
      } else {
        const acceptedAnswers = questionSession.acceptable_answers.length
          ? questionSession.acceptable_answers
          : [questionSession.correct_answer];
        const isCorrect = matchesAcceptedAnswer(triviaAnswer as string, acceptedAnswers);
        score = isCorrect ? 100 : 0;
        result = {
          isCorrect,
          correctAnswer: questionSession.correct_answer,
          explanation: isCorrect
            ? `${questionSession.correct_answer} is correct.`
            : `The accepted answer is ${questionSession.correct_answer}.`,
          score,
          verdict: isCorrect ? 'Correct!' : 'Not Quite!',
        };
      }

      const { data: finalizedRows, error: finalizeError } = await adminClient.rpc('finalize_question_session', {
        p_user_id: user.id,
        p_session_id: questionSession.id,
        p_evaluation_token: questionSession.evaluation_token,
        p_score: score,
        p_deviation_percent: deviation,
      });
      if (finalizeError) {
        if (finalizeError.message.includes('already finalized')) throw new HttpError(409, 'Question was already answered');
        if (finalizeError.message.includes('expired')) throw new HttpError(410, 'Question expired');
        throw new Error(`Could not finalize score: ${finalizeError.message}`);
      }
      const stats = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
      activeClaim = null;
      return json({ ...result, stats });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (error) {
    if (releaseActiveClaim) await releaseActiveClaim();
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body' }, 400);
    console.error('[generate-question] Unexpected error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
