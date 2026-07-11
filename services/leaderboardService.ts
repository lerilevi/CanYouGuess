import { getSupabaseClient } from '@/template';

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  total_score: number;
  daily_score: number;
  weekly_score: number;
  country: string | null;
}

export type TimeFilter = 'daily' | 'weekly' | 'all_time';
export type ScopeFilter = 'local' | 'global';

export const getLeaderboard = async (
  timeFilter: TimeFilter,
  scopeFilter: ScopeFilter,
  userCountry: string | null,
  limit = 10
): Promise<LeaderboardEntry[]> => {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('leaderboard_scores')
    .select('user_id, username, total_score, daily_score, weekly_score, country');

  if (scopeFilter === 'local' && userCountry) {
    query = query.eq('country', userCountry);
  }

  const scoreField =
    timeFilter === 'daily' ? 'daily_score' :
    timeFilter === 'weekly' ? 'weekly_score' : 'total_score';

  query = query.order(scoreField, { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error('Leaderboard error:', error);
    return [];
  }

  return (data ?? []).map((entry, idx) => ({
    rank: idx + 1,
    user_id: entry.user_id,
    username: entry.username,
    total_score: entry.total_score,
    daily_score: entry.daily_score,
    weekly_score: entry.weekly_score,
    country: entry.country,
  }));
};

export const getUserRank = async (
  userId: string,
  timeFilter: TimeFilter,
  scopeFilter: ScopeFilter,
  userCountry: string | null
): Promise<{ rank: number; score: number } | null> => {
  const supabase = getSupabaseClient();

  const scoreField =
    timeFilter === 'daily' ? 'daily_score' :
    timeFilter === 'weekly' ? 'weekly_score' : 'total_score';

  let query = supabase
    .from('leaderboard_scores')
    .select('user_id, ' + scoreField);

  if (scopeFilter === 'local' && userCountry) {
    query = query.eq('country', userCountry);
  }

  query = query.order(scoreField, { ascending: false });

  const { data } = await query;
  if (!data) return null;

  const idx = data.findIndex((e) => e.user_id === userId);
  if (idx === -1) return null;

  return {
    rank: idx + 1,
    score: (data[idx] as Record<string, unknown>)[scoreField] as number,
  };
};
