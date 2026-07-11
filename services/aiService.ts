import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GeneratedQuestion {
  type: 'estimation' | 'trivia';
  question: string;
  hint: string;
  correctAnswer?: string;
}

export interface EstimationResult {
  estimatedAnswer: number;
  unit: string;
  steps: string[];
  deviationPercent: number;
  score: number;
  verdict: string;
}

export interface TriviaResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  score: number;
  verdict: string;
}

// ─── Recent question history ────────────────────────────────────────────────
// Store last 15 question texts per category key so the AI avoids repetition.

const HISTORY_KEY = '@canyouguess_question_history_v1';
const MAX_HISTORY = 15;

type HistoryMap = Record<string, string[]>;

async function loadHistory(): Promise<HistoryMap> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryMap) : {};
  } catch {
    return {};
  }
}

async function saveHistory(map: HistoryMap): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

async function getRecentTopics(category: string): Promise<string[]> {
  const map = await loadHistory();
  return map[category] ?? [];
}

async function recordQuestion(category: string, question: string): Promise<void> {
  const map = await loadHistory();
  const existing = map[category] ?? [];
  // Keep most recent MAX_HISTORY entries
  map[category] = [question, ...existing].slice(0, MAX_HISTORY);
  await saveHistory(map);
}

// ─── Shared fetch helper ─────────────────────────────────────────────────────

const invokeWithErrorParsing = async (fnName: string, body: Record<string, unknown>) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = error.context?.status ?? 500;
        const text = await error.context?.text();
        message = `[${statusCode}] ${text || error.message}`;
      } catch {
        message = error.message;
      }
    }
    throw new Error(message);
  }
  return data;
};

// ─── Public API ──────────────────────────────────────────────────────────────

export const generateQuestion = async (
  category: string,
  country: string,
  questionTypePreference: 'estimation' | 'trivia' | 'mix' = 'mix'
): Promise<GeneratedQuestion> => {
  // Load recent questions so the AI knows what to avoid
  const recentTopics = await getRecentTopics(category);

  const data = await invokeWithErrorParsing('generate-question', {
    action: 'generate',
    category,
    country,
    questionTypePreference,
    recentTopics,
  });

  const question = data as GeneratedQuestion;

  // Record this question text to prevent near-future repetition
  if (question?.question) {
    await recordQuestion(category, question.question);
  }

  return question;
};

export const evaluateEstimation = async (
  question: string,
  userAnswer: number
): Promise<EstimationResult> => {
  const data = await invokeWithErrorParsing('generate-question', {
    action: 'evaluate_estimation',
    question,
    userAnswer,
  });
  return data as EstimationResult;
};

export const evaluateTrivia = async (
  question: string,
  correctAnswer: string,
  userAnswer: string
): Promise<TriviaResult> => {
  const data = await invokeWithErrorParsing('generate-question', {
    action: 'evaluate_trivia',
    question,
    correctAnswer,
    userAnswer,
  });
  return data as TriviaResult;
};
