// Edge Function: generate-question
// Generates trivia/estimation questions and evaluates answers using OnSpace AI

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, category, country, question, userAnswer, correctAnswer, questionTypePreference } = body;

    const callAI = async (userPrompt: string): Promise<string> => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 1.2,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI API error: ${res.status} ${errText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    };

    const parseJSON = (raw: string): Record<string, unknown> => {
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
