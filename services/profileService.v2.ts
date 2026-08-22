/**
 * profileService.v2.ts
 *
 * ⚠️  NOT WIRED IN. Nothing imports this file yet.
 *
 * Only the functions whose behaviour changes against the new backend are
 * reimplemented here. Everything else in profileService.ts carries over
 * unchanged. At cutover, fold these into profileService.ts and delete this file.
 *
 * What changes:
 *  - submitAnswer's five sequential writes collapse into one submit_score()
 *    RPC, which is transactional. The old sequence could lose an update if two
 *    answers landed close together, and it is what produced the broken
 *    daily_score / weekly_score values.
 *  - questions_today is derived from score_events instead of being a counter
 *    the client resets, so it cannot drift.
 *  - Username updates go through update_my_username(), which reports a real
 *    uniqueness conflict instead of silently succeeding.
 *  - deleteUserAccount sends the confirm token the new Edge Function requires.
 */

import { getSupabaseClient } from '@/template';

export interface SubmitScoreResult {
  total_score: number;
  total_questions: number;
  current_streak: number;
  longest_streak: number;
  questions_today: number;
}

/**
 * Records one answer. Replaces updateUserStats + updateCategoryScore + the
 * leaderboard_scores upsert. Returns the caller's refreshed totals, so no
 * follow-up read is needed.
 */
export const submitScore = async (
  category: string,
  score: number,
  questionType: 'trivia' | 'estimation'
): Promise<SubmitScoreResult | null> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('submit_score', {
    p_category: category,
    p_score: score,
    p_question_type: questionType,
  });

  if (error) {
    console.error('[profile] submit_score failed:', error.message);
    return null;
  }

  return (data as SubmitScoreResult[] | null)?.[0] ?? null;
};

/** Questions answered since 00:00 UTC today. Drives the free-tier daily gate. */
export const getDailyUsage = async (): Promise<number> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('get_my_daily_usage');
  if (error) {
    console.error('[profile] get_my_daily_usage failed:', error.message);
    // Fail open rather than locking a paying-adjacent user out of the game.
    return 0;
  }

  return (data as { questions_today: number }[] | null)?.[0]?.questions_today ?? 0;
};

/** Idempotent. Returns true only when this call is what awarded the badge. */
export const awardBadge = async (badgeId: string): Promise<boolean> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('award_badge', { p_badge_id: badgeId });
  if (error) {
    console.error('[profile] award_badge failed:', error.message);
    return false;
  }
  return data === true;
};

export const updateUsername = async (newUsername: string): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();

  const { error } = await supabase.rpc('update_my_username', { p_username: newUsername });
  if (error) {
    // 23505 is the unique-violation the RPC raises for a taken name.
    if (error.code === '23505') return { error: 'That username is already taken.' };
    return { error: error.message };
  }

  // Mirror into auth metadata for consistency. The DB trigger keeps the two in
  // step in the other direction, so this is belt-and-braces, not required.
  const { error: authError } = await supabase.auth.updateUser({ data: { username: newUsername } });
  if (authError) {
    console.warn('[profile] auth metadata sync failed:', authError.message);
  }

  return { error: null };
};

/** Country is written to user_profiles only — user_stats no longer carries it. */
export const saveUserCountry = async (countryCode: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;

  const { error } = await supabase
    .from('user_profiles')
    .update({ country: countryCode.toUpperCase() })
    .eq('id', uid);

  if (error) console.warn('[profile] saveUserCountry failed:', error.message);
};

export const deleteUserAccount = async (): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();

  const { error: fnError } = await supabase.functions.invoke('delete-account', {
    body: { confirm: 'DELETE' },
  });

  if (fnError) {
    const { FunctionsHttpError } = await import('@supabase/supabase-js');
    let msg = fnError.message;
    if (fnError instanceof FunctionsHttpError) {
      try {
        const text = await fnError.context?.text();
        msg = text ?? msg;
      } catch { /* ignore */ }
    }
    return { error: msg };
  }

  // The auth user is gone server-side; clear the local session.
  await supabase.auth.signOut();
  return { error: null };
};
