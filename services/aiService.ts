import * as Crypto from 'expo-crypto';
import { captureIdentity, assertCurrentIdentity, IdentityScope } from './identityScope';
import { readUserCache, updateUserCache } from './userCache';
import { ownedRequest } from './ownedBackend';

export interface GeneratedQuestion {
  questionId: string; type: 'estimation' | 'trivia'; question: string;
  hint: string; unit: string; expiresAt: string;
}
export interface ServerScoreStats { new_badges?: string[] }
export interface EstimationResult {
  estimatedAnswer: number; unit: string; steps: string[]; deviationPercent: number;
  score: number; verdict: string; stats?: ServerScoreStats;
}
export interface TriviaResult {
  isCorrect: boolean; correctAnswer: string; explanation: string; score: number;
  verdict: string; stats?: ServerScoreStats;
}
export interface PlayState {
  questions_today: number; free_limit: number; bonus_remaining: number;
  paid: boolean; can_play: boolean; reset_at: string; server_now: string;
  local_date: string; timezone: string; rewards_available: boolean;
}
type History = Record<string, string[]>;
export async function getPlayState(scope = captureIdentity()): Promise<PlayState> {
  const rows = await ownedRequest<PlayState[]>('/functions/v1/generate-question',
    {method:'POST',body:JSON.stringify({action:'play_state'})},scope);
  if (!rows?.[0]?.server_now) throw new Error('The authoritative play contract is not deployed.');
  return rows[0];
}
export async function generateQuestion(category: string, country: string, preference: 'estimation'|'trivia'|'mix' = 'mix', scope = captureIdentity()): Promise<GeneratedQuestion> {
  const history = await readUserCache<History>(scope, 'question-history') ?? {};
  const data = await ownedRequest<GeneratedQuestion>('/functions/v1/generate-question', {
    method: 'POST', body: JSON.stringify({ action: 'generate', requestId: Crypto.randomUUID(),
      category, country, questionTypePreference: preference, recentTopics: history[category] ?? [] }),
  }, scope);
  if (!data.questionId || !data.question || !data.expiresAt || typeof data.unit !== 'string') {
    throw new Error('Question contract mismatch. Play is paused; no legacy scoring fallback is allowed.');
  }
  await updateUserCache<History>(scope, 'question-history', previous => ({
    ...(previous ?? {}), [category]: [data.question, ...(previous?.[category] ?? [])].slice(0, 15),
  })).catch(() => { assertCurrentIdentity(scope); });
  assertCurrentIdentity(scope);
  return data;
}
export const evaluateEstimation = (questionId: string, userAnswer: number, scope?: IdentityScope) =>
  ownedRequest<EstimationResult>('/functions/v1/generate-question', { method: 'POST',
    body: JSON.stringify({ action: 'evaluate_estimation', questionId, userAnswer }) }, scope);
export const evaluateTrivia = (questionId: string, userAnswer: string, scope?: IdentityScope) =>
  ownedRequest<TriviaResult>('/functions/v1/generate-question', { method: 'POST',
    body: JSON.stringify({ action: 'evaluate_trivia', questionId, userAnswer }) }, scope);
