import { getSupabaseClient } from '@/template';

export interface UserStats {
  id: string;
  user_id: string;
  total_score: number;
  total_questions: number;
  current_streak: number;
  longest_streak: number;
  country: string | null;
  questions_today: number;
  last_daily_reset: string;
  last_played_at: string | null;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
}

export interface CategoryScore {
  id: string;
  user_id: string;
  category: string;
  highest_score: number;
  questions_answered: number;
}

export const getOrCreateUserStats = async (userId: string): Promise<UserStats | null> => {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.last_daily_reset !== today) {
      const { data: updated } = await supabase
        .from('user_stats')
        .update({ questions_today: 0, last_daily_reset: today })
        .eq('user_id', userId)
        .select()
        .single();
      return updated;
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from('user_stats')
    .insert({
      user_id: userId,
      total_score: 0,
      total_questions: 0,
      current_streak: 0,
      longest_streak: 0,
      questions_today: 0,
      last_daily_reset: today,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user stats:', error);
    return null;
  }
  return created;
};

export const updateUserStats = async (
  userId: string,
  scoreGained: number,
  username: string
): Promise<UserStats | null> => {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const existing = await getOrCreateUserStats(userId);
  if (!existing) return null;

  const newTotal = existing.total_score + scoreGained;
  const newQuestions = existing.total_questions + 1;
  const newToday = existing.questions_today + 1;

  // Streak logic
  const lastPlayed = existing.last_played_at
    ? new Date(existing.last_played_at).toISOString().split('T')[0]
    : null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  let newStreak = existing.current_streak;

  if (!lastPlayed || lastPlayed === yesterday) {
    newStreak = lastPlayed === today ? existing.current_streak : existing.current_streak + 1;
  } else if (lastPlayed !== today) {
    newStreak = 1;
  }

  const newLongest = Math.max(existing.longest_streak, newStreak);

  const { data: updated } = await supabase
    .from('user_stats')
    .update({
      total_score: newTotal,
      total_questions: newQuestions,
      questions_today: newToday,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_played_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  // Update leaderboard with correct username
  await supabase
    .from('leaderboard_scores')
    .upsert({
      user_id: userId,
      username: username,
      total_score: newTotal,
      daily_score: newToday === 1 ? scoreGained : Math.min(newToday * scoreGained, newTotal),
      weekly_score: newTotal,
      score_date: today,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  return updated ?? null;
};

export const updateUsername = async (userId: string, newUsername: string): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ username: newUsername })
    .eq('id', userId);

  if (profileError) return { error: profileError.message };

  // Sync username into Supabase Auth user metadata so it persists across sessions
  const { error: authError } = await supabase.auth.updateUser({
    data: { username: newUsername },
  });
  if (authError) {
    console.warn('[updateUsername] Failed to sync auth metadata:', authError.message);
  }

  // Also update username in leaderboard_scores
  await supabase
    .from('leaderboard_scores')
    .update({ username: newUsername })
    .eq('user_id', userId);

  return { error: null };
};

export const updateEmail = async (newEmail: string): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message };
  return { error: null };
};

export const updatePassword = async (newPassword: string): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { error: null };
};

export const getUserBadges = async (userId: string): Promise<UserBadge[]> => {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId);
  return data ?? [];
};

export const awardBadge = async (userId: string, badgeId: string): Promise<boolean> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_badges')
    .insert({ user_id: userId, badge_id: badgeId })
    .select();
  return !error;
};

export const getCategoryScores = async (userId: string): Promise<CategoryScore[]> => {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('category_scores')
    .select('*')
    .eq('user_id', userId);
  return data ?? [];
};

export const updateCategoryScore = async (
  userId: string,
  category: string,
  score: number
): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('category_scores')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .single();

  if (existing) {
    await supabase
      .from('category_scores')
      .update({
        highest_score: Math.max(existing.highest_score, score),
        questions_answered: existing.questions_answered + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('category', category);
  } else {
    await supabase
      .from('category_scores')
      .insert({
        user_id: userId,
        category,
        highest_score: score,
        questions_answered: 1,
      });
  }
};

/**
 * Saves the detected country to user_stats and leaderboard_scores.
 * Called once after IP-based detection; safe to call multiple times (idempotent).
 */
export const saveUserCountry = async (
  userId: string,
  countryCode: string
): Promise<void> => {
  const supabase = getSupabaseClient();
  await supabase
    .from('user_stats')
    .update({ country: countryCode })
    .eq('user_id', userId);

  await supabase
    .from('leaderboard_scores')
    .update({ country: countryCode })
    .eq('user_id', userId);
};

export const deleteUserAccount = async (): Promise<{ error: string | null }> => {
  const supabase = getSupabaseClient();
  // Sign the user out; actual deletion should be done via a backend edge function
  const { error } = await supabase.auth.signOut();
  if (error) return { error: error.message };
  return { error: null };
};
