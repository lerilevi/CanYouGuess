import { captureIdentity, getIdentityScope, beginIdentityTransition, assertCurrentIdentity } from './identityScope';
import { ownedRequest, ownedRpc } from './ownedBackend';
import { getPlayState } from './aiService';
import { getSupabaseClient } from '@/template';
import { clearUserCaches } from './userCache';

export interface UserStats {
  id: string; user_id: string; total_score: number; total_questions: number;
  current_streak: number; longest_streak: number; country: string | null;
  questions_today: number; last_daily_reset: string; last_played_at: string | null;
}
export interface UserBadge { id: string; user_id: string; badge_id: string; earned_at: string }
export interface CategoryScore { id: string; user_id: string; category: string; highest_score: number; questions_answered: number }

export async function getOrCreateUserStats(userId: string): Promise<UserStats | null> {
  const scope = captureIdentity(userId);
  const [stats, profiles, play] = await Promise.all([
    ownedRequest<Omit<UserStats, 'id'|'country'|'questions_today'|'last_daily_reset'>[]>('/rest/v1/user_stats?select=*&user_id=eq.' + userId, {}, scope),
    ownedRequest<{country:string|null}[]>('/rest/v1/user_profiles?select=country&id=eq.' + userId, {}, scope),
    getPlayState(scope),
  ]);
  assertCurrentIdentity(scope);
  const row = stats[0];
  // Null/empty responses never reuse a previous account's state.
  return row ? { ...row, id: userId, country: profiles[0]?.country ?? null,
    questions_today: play.questions_today, last_daily_reset: play.local_date } : null;
}
export const getUserBadges = async (userId: string): Promise<UserBadge[]> => {
  const scope = captureIdentity(userId);
  const rows = await ownedRequest<Omit<UserBadge,'id'>[]>('/rest/v1/user_badges?select=*&user_id=eq.'+userId, {}, scope);
  return rows.map(row => ({ ...row, id: row.user_id+':'+row.badge_id }));
};
export const getCategoryScores = async (userId: string): Promise<CategoryScore[]> => {
  const scope = captureIdentity(userId);
  const rows = await ownedRequest<Omit<CategoryScore,'id'>[]>('/rest/v1/category_scores?select=*&user_id=eq.'+userId, {}, scope);
  return rows.map(row => ({ ...row, id: row.user_id+':'+row.category }));
};
export const updateUsername = async (userId:string, username:string): Promise<{error:string|null}> => {
  const scope = captureIdentity(userId);
  try { await ownedRpc('update_my_username', {p_username:username}, scope); return {error:null}; }
  catch (e) { assertCurrentIdentity(scope); return {error:e instanceof Error ? e.message : 'Nickname update failed.'}; }
};
export const updateEmail = async (email:string) => updateAuth({email});
export const updatePassword = async (password:string) => updateAuth({password});
async function updateAuth(body: Record<string,string>): Promise<{error:string|null}> {
  const scope = captureIdentity();
  try { await ownedRequest('/auth/v1/user', {method:'PUT', body:JSON.stringify(body)}, scope); return {error:null}; }
  catch(e) { assertCurrentIdentity(scope); return {error:e instanceof Error ? e.message : 'Account update failed.'}; }
}
export async function saveUserCountry(userId:string, countryCode:string): Promise<void> {
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Invalid country code.');
  await ownedRequest('/rest/v1/user_profiles?id=eq.'+userId, {method:'PATCH', headers:{Prefer:'return=representation'},
    body:JSON.stringify({country:countryCode})}, captureIdentity(userId));
}
export async function deleteUserAccount(): Promise<{error:string|null}> {
  const scope = captureIdentity();
  try {
    await ownedRequest('/functions/v1/delete-account', {method:'POST',body:JSON.stringify({confirm:'DELETE'})}, scope);
    assertCurrentIdentity(scope);
    beginIdentityTransition();
    // Start sign-out synchronously after ownership check, before awaiting anything.
    await getSupabaseClient().auth.signOut({scope:'local'});
    await clearUserCaches(scope);
    return {error:null};
  } catch(e) {
    if (getIdentityScope().userId && getIdentityScope() !== scope) throw e;
    return {error:e instanceof Error ? e.message : 'Deletion failed.'};
  }
}
