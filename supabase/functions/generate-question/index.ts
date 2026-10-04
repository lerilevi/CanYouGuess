// Authenticated, rate-limited Gemini gateway with server-authoritative scoring.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { evaluateFrozen, RUBRIC_VERSION } from '../_shared/estimation.ts';
import { normalizeAnswer, containsNormalizedPhrase, matchesAcceptedAnswer } from '../_shared/trivia.ts';
import { SYSTEM_PROMPT, QUESTION_SCHEMA, generatePrompt } from '../_shared/questionPrompt.ts';

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
const MAX_PROVIDER_ATTEMPTS = 3;
const PROVIDER_RETRY_BASE_DELAY_MS = 500;
const MAX_REQUEST_BYTES = 16_384;

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
  let playReservation: string | null = null;
  let releasePlay: (() => Promise<void>) | null = null;

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
      const requestBody = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          responseJsonSchema,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
        },
      });

      for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
            body: requestBody,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new HttpError(504, 'AI provider timed out');
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          const responseText = (await response.text()).slice(0, 500);
          const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
          console.error(
            `[generate-question] Gemini returned ${response.status} on attempt ${attempt}/${MAX_PROVIDER_ATTEMPTS}:`,
            responseText,
          );
          if (retryable) {
            if (attempt === MAX_PROVIDER_ATTEMPTS) {
              throw new HttpError(503, 'AI provider temporarily unavailable');
            }
            const retryDelayMs = PROVIDER_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
            console.warn(`[generate-question] Retrying Gemini in ${retryDelayMs}ms.`);
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            continue;
          }
          throw new Error('AI provider request failed');
        }
        const payload = await response.json();
        if (payload.promptFeedback?.blockReason) throw new HttpError(422, 'The AI provider blocked this request');
        const candidate = payload.candidates?.[0];
        if (!candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
          throw new Error('AI provider returned no complete candidate');
        }
        const text = (candidate.content?.parts ?? [])
          .filter((part: {thought?:boolean}) => !part.thought)
          .map((part: { text?: string }) => part.text ?? '')
          .join('');
        if (!text.trim()) throw new Error('AI provider returned an empty response');
        return parseObject(text);
      }

      throw new HttpError(503, 'AI provider temporarily unavailable');
    };

    const verifyPurchase = async () => {
      const secret = Deno.env.get('REVENUECAT_SECRET_KEY');
      const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID');
      let active = false;
      if (secret && entitlement) {
        const response = await fetch('https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(user.id), {
          headers: {Authorization: 'Bearer '+secret}, signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new HttpError(503,'Purchase verification temporarily unavailable');
        const payload = await response.json();
        const e = payload.subscriber?.entitlements?.[entitlement];
        const allowSandbox = Deno.env.get('ALLOW_SANDBOX_PURCHASES') === 'true';
        const product = payload.subscriber?.non_subscriptions?.[e?.product_identifier];
        const subscriptions = payload.subscriber?.subscriptions?.[e?.product_identifier];
        const sandbox = subscriptions?.is_sandbox ?? product?.[product.length-1]?.is_sandbox;
        active = Boolean(e && (!e.expires_date || Date.parse(e.expires_date)>Date.now())
          && (allowSandbox || sandbox === false));
      }
      const {error} = await adminClient.rpc('set_verified_purchase',{p_uid:user.id,p_active:active});
      if (error) throw new Error('Purchase state could not be synchronized');
    };
    if (action === 'play_state') {
      await verifyPurchase();
      const {data,error} = await userClient.rpc('get_my_play_state');
      if (error) throw new Error('Play state unavailable');
      return json(data);
    }

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

      const requestId = boundedString(input.requestId,'requestId',64);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
        throw new HttpError(400,'Invalid requestId');
      await verifyPurchase();
      const {data:reservation,error:reservationError} = await adminClient.rpc('reserve_play', {
        p_uid:user.id,p_request:requestId,p_category:category,
      });
      if (reservationError) {
        if (reservationError.code === '55P03') throw new HttpError(409,'Question request already used or in progress');
        if (reservationError.code === '42501') throw new HttpError(403,'Premium category locked');
        if (reservationError.message.includes('allowance')) throw new HttpError(429,'Daily allowance exhausted');
        throw new Error('Play reservation failed');
      }
      if (reservation?.replay) return json(reservation);
      playReservation=reservation?.reservationId;
      if (!playReservation) throw new Error('Reservation id missing');
      releasePlay=async () => { if (playReservation) await adminClient.rpc('release_play',{p_uid:user.id,p_reservation:playReservation}); };
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
      const referenceAnswer = type === 'estimation' ? Number(generated.referenceAnswer) : null;
      const unit = type === 'estimation' ? boundedString(generated.unit,'unit',80) : '';
      const steps = type === 'estimation' && Array.isArray(generated.steps)
        ? generated.steps.slice(0,5).map((s,i) => boundedString(s,`steps[${i}]`,240)) : [];
      if (type === 'estimation' && (!Number.isFinite(referenceAnswer) || referenceAnswer! <= 0 || steps.length<2))
        throw new Error('Missing valid frozen estimation reference');
      const expiresAt = new Date(Date.now()+15*60_000).toISOString();
      const {data:questionId,error:sessionError} = await adminClient.rpc('create_reserved_question',{
        p_uid:user.id,p_reservation:playReservation,
        p_payload:{type,question,hint,correctAnswer,acceptableAnswers,referenceAnswer,unit,steps,rubricVersion:RUBRIC_VERSION},
      });
      if (sessionError || typeof questionId !== 'string') throw new Error('Question session could not be committed');
      playReservation=null;
      return json({questionId,type,question,hint,unit,expiresAt});
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
        const {data:frozen,error:frozenError} = await adminClient.rpc('get_frozen_reference',{
          p_uid:user.id,p_session:questionSession.id,p_token:questionSession.evaluation_token,
        });
        if (frozenError || frozen?.rubricVersion !== RUBRIC_VERSION) throw new Error('Frozen reference unavailable');
        const estimatedAnswer = Number(frozen.referenceAnswer);
        const evaluated = evaluateFrozen(estimatedAnswer,estimationAnswer as number);
        deviation=evaluated.deviationPercent; score=evaluated.score;
        const unit = boundedString(frozen.unit,'unit',80);
        const steps = Array.isArray(frozen.steps) ? frozen.steps : [];
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
    if (releasePlay) await releasePlay();
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON body' }, 400);
    console.error('[generate-question] Unexpected error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
