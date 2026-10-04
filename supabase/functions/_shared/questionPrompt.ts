export const SYSTEM_PROMPT = `You are a trivia/estimation game engine for "Can You Guess?". Generate fun questions and evaluate answers.
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


export const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['trivia', 'estimation'] },
    question: { type: 'string' },
    hint: { type: 'string' },
    correctAnswer: { type: 'string' },
    acceptableAnswers: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    referenceAnswer: { type: ['number','null'] },
    unit: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['type', 'question', 'hint', 'correctAnswer', 'acceptableAnswers', 'referenceAnswer', 'unit', 'steps'],
};

export function generatePrompt(
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
    ? `Optional inspiration ONLY IF it fits the category: "${forcedTheme}".`
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
Estimation: freeze a positive finite referenceAnswer now (no player's guess is supplied), an explicit unit,
and 2-5 short supporting steps. The question must specify that unit, geography/time scope and whether approximate.
Use plain units (e.g. people, kilometres, litres); never require an implicit thousands/millions conversion.
Trivia: referenceAnswer=null, unit="", steps=[], factual primary answer and aliases only.
{"type":"estimation"or"trivia","question":"...","hint":"max 8 words or empty","correctAnswer":"primary trivia answer or empty","acceptableAnswers":[],"referenceAnswer":null,"unit":"","steps":[]}`;
}
