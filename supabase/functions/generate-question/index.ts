// Edge Function: generate-question
// Generates trivia/estimation questions and evaluates answers using Google Gemini.

import { corsHeaders } from '../_shared/cors.ts';

const SYSTEM_PROMPT = `You are a trivia/estimation game engine for "Can You Guess?". Generate fun questions and evaluate answers.
Types: ESTIMATION (Fermi-style numeric guesses) and TRIVIA (factual, one correct answer).
Rules: English only, match category, no offensive content, brief explanations.
QUESTION LENGTH: MUST be 8-14 words maximum. Short, punchy, direct. No lengthy preambles.
Respond with valid JSON only — no markdown, no extra text.`;

// 50-topic wheel — seed index selects a forced sub-theme to guarantee variety across sessions
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
  'nanotechnology and materials science', 'insects and arachnids', 'famous speeches and rhetoric', 'cryptography and codes', 'traditional clothing and fashion history'
];

const GENERATE_PROMPT = (category: string, country: string, seed: string, questionTypePref: string, recentTopics: string[] = []) => {
  const seedNum = seed.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);

  const typeInstruction =
    questionTypePref === 'estimation' ? 'MUST be ESTIMATION (Fermi-style numeric guess like "How many...?"). Not trivia.' :
    questionTypePref === 'trivia'     ? 'MUST be TRIVIA (factual, one clear answer like "What is...?"). Not estimation.' :
    `Seed sum is ${seedNum % 2 === 0 ? 'even → use estimation' : 'odd → use trivia'}.`;

  const forcedTheme = TOPIC_WHEEL[seedNum % TOPIC_WHEEL.length];

  const isLocationCategory = category === 'my_country' || category === 'My Country';
  const resolvedCountry = country && country !== 'World' && country !== 'Unknown' ? country : null;

  const locationRule = isLocationCategory && resolvedCountry
    ? `CATEGORY: "My Country" = ${resolvedCountry}. Question MUST be specifically about ${resolvedCountry} and name it.`
    : isLocationCategory
    ? `CATEGORY: "My Country" (country unknown). Generate a country-themed question.`
    : `CATEGORY: "${category}". General world-knowledge only — not country-specific.`;

  const themeBlock = (!isLocationCategory || !resolvedCountry)
    ? `THEME (MANDATORY): Question MUST relate to "${forcedTheme}". Anchor clearly to this theme.`
    : '';

  const recentBlock = recentTopics.length > 0
    ? `BANNED TOPICS (already used — do NOT touch these): ${recentTopics.join(' | ')}. Pick something completely unrelated.`
    : '';

  return `Generate ONE question. Seed: ${seed}
${recentBlock ? recentBlock + '\n' : ''}${themeBlock ? themeBlock + '\n' : ''}${locationRule}
Type: ${typeInstruction}
LENGTH: Question MUST be 8-14 words. Count words. Reject if longer.
Avoid all clichés: Mona Lisa, capital cities, speed of light, Great Wall, etc. Be specific and surprising.
JSON only:
{"type":"estimation"or"trivia","question":"...","hint":"max 8 words or empty","correctAnswer":"trivia answer or empty"}`;
};

const EVALUATE_ESTIMATION_PROMPT = (question: string, userAnswer: number) => `Q: "${question}"
User estimate: ${userAnswer.toLocaleString()}
Evaluate. JSON only:
{"estimatedAnswer":<number>,"unit":"<unit>","steps":["<step1>","<step2>","<step3>"],"deviationPercent":<number>,"score":<0-100>,"verdict":"<Spot On!|Pretty Close!|Nice Try!|Way Off!>"}
Score: 0%=100, 1-5%=90-99, 6-20%=70-89, 21-50%=40-69, 51-100%=20-39, >100%=0-19`;

const EVALUATE_TRIVIA_PROMPT = (question: string, correctAnswer: string, userAnswer: string) => `Q: "${question}"
Correct: "${correctAnswer}"
User: "${userAnswer}"
Allow spelling variants/abbreviations. JSON only:
{"isCorrect":true/false,"correctAnswer":"<proper answer>","explanation":"<1-2 sentences>","score":<100 or 0>,"verdict":"<Correct!|Not Quite!>"}`;

// ─── Google Gemini (direct) ──────────────────────────────────────────────────
// Previously this called OnSpace's OpenAI-compatible gateway
// (ONSPACE_AI_BASE_URL + /chat/completions) with model
// 'google/gemini-3-flash-preview'. That gateway proxied to Google, so this is
// the same underlying model reached directly — the 'google/' provider prefix
// is a gateway routing convention and is not part of the Gemini model id.
//
// Required secret: GEMINI_API_KEY (Google AI Studio).
// Set with:  supabase secrets set GEMINI_API_KEY=...
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Overridable so the model can be moved without a code change.
// 'gemini-3-flash-preview' keeps the exact model that was in use. It is a
// *preview* id — if Google retires it, set GEMINI_MODEL to a GA Flash model
// (e.g. gemini-3.7-flash) and redeploy.
const DEFAULT_MODEL = 'gemini-3-flash-preview';

// Gemini 3 models reason before answering. Left unset the model uses its own
// default, matching the previous gateway behaviour. If question latency hurts
// the real-time feel, set GEMINI_THINKING_LEVEL=low to trade a little quality
// for speed — that is the single biggest latency lever here.
const THINKING_LEVEL = Deno.env.get('GEMINI_THINKING_LEVEL');

// The game blocks on this call, so a hung request must not hang the round.
const REQUEST_TIMEOUT_MS = Number(Deno.env.get('GEMINI_TIMEOUT_MS') ?? '20000');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;

    if (!apiKey) {
      console.error('[generate-question] GEMINI_API_KEY is not set.');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, category, country, question, userAnswer, correctAnswer, questionTypePreference } = body;

    const callAI = async (userPrompt: string): Promise<string> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            // Header auth, never ?key= — a key in a URL leaks into logs.
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 1.2,
              // Every prompt here demands JSON only; asking Gemini to enforce
              // it removes the markdown-fence failure mode parseJSON works
              // around.
              responseMimeType: 'application/json',
              ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
            },
          }),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error: ${res.status} ${errText}`);
      }

      const data = await res.json();

      // A safety block returns 200 with no candidate, so this must be checked
      // explicitly or it surfaces as a confusing JSON parse failure.
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Gemini blocked the prompt: ${blockReason}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no candidates');
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Gemini stopped early: ${candidate.finishReason}`);
      }

      const text = (candidate.content?.parts ?? [])
        .map((part: { text?: string }) => part.text ?? '')
        .join('');

      if (!text.trim()) {
        throw new Error('Gemini returned an empty response');
      }

      return text;
    };

    const parseJSON = (raw: string): Record<string, unknown> => {
      // responseMimeType should make fences impossible, but stripping them is
      // cheap insurance against a model or config change.
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    };

    if (action === 'generate') {
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const recentTopics: string[] = Array.isArray(body.recentTopics) ? (body.recentTopics as string[]).slice(0, 10) : [];
      const raw = await callAI(GENERATE_PROMPT(category || 'World', country || 'Unknown', seed, questionTypePreference || 'mix', recentTopics));
      const parsed = parseJSON(raw);

      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'evaluate_estimation') {
      const raw = await callAI(EVALUATE_ESTIMATION_PROMPT(question, Number(userAnswer)));
      const parsed = parseJSON(raw);
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'evaluate_trivia') {
      const raw = await callAI(EVALUATE_TRIVIA_PROMPT(question, correctAnswer, userAnswer));
      const parsed = parseJSON(raw);
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('generate-question error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
