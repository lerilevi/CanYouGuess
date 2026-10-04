import { ownedRpc } from './ownedBackend';
import { captureIdentity } from './identityScope';

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

/** Maps the UI's filter names onto the p_window argument of the RPCs. */
function toWindow(timeFilter: TimeFilter): 'daily' | 'weekly' | 'all_time' {
  return timeFilter;
}

interface LeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  country: string | null;
  score: number;
}

export const getLeaderboard = async (
  timeFilter: TimeFilter,
  scopeFilter: ScopeFilter,
  userCountry: string | null,
  limit = 10
): Promise<LeaderboardEntry[]> => {
  const scope = captureIdentity();

  const data = await ownedRpc<LeaderboardRow[]>('get_leaderboard', {
    p_window: toWindow(timeFilter),
    p_country: scopeFilter === 'local' ? userCountry : null,
    p_limit: limit,
    p_offset: 0,
  }, scope);

  // The RPC returns one `score` for the requested window. The legacy
  // LeaderboardEntry shape carries three score fields, so the active one is
  // filled and the others zeroed — the UI only reads the one it asked for.
  return ((data ?? []) as LeaderboardRow[]).map((row) => ({
    rank: Number(row.rank),
    user_id: row.user_id,
    username: row.username,
    country: row.country,
    total_score: timeFilter === 'all_time' ? row.score : 0,
    daily_score: timeFilter === 'daily' ? row.score : 0,
    weekly_score: timeFilter === 'weekly' ? row.score : 0,
  }));
};

export const getUserRank = async (
  userId: string,
  timeFilter: TimeFilter,
  scopeFilter: ScopeFilter,
  userCountry: string | null
): Promise<{ rank: number; score: number } | null> => {
  const scope = captureIdentity(userId);

  const data = await ownedRpc<{rank:number;score:number}[]>('get_user_rank', {
    p_user_id: userId,
    p_window: toWindow(timeFilter),
    p_country: scopeFilter === 'local' ? userCountry : null,
  }, scope);

  // No row means the user has no score in this window — genuinely unranked,
  // which the caller must not render as rank 0.
  const row = (data as { rank: number; score: number }[] | null)?.[0];
  if (!row) return null;

  return { rank: Number(row.rank), score: row.score };
};
