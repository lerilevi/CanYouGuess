import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { LeaderboardRow } from '@/components/ui/LeaderboardRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import {
  getLeaderboard,
  getUserRank,
  LeaderboardEntry,
  TimeFilter,
  ScopeFilter,
} from '@/services/leaderboardService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'all_time', label: 'All Time' },
];

const SCOPE_FILTERS: { id: ScopeFilter; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'global', label: 'Global' },
];

export default function LeaderboardTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all_time');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<{ rank: number; score: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userCountry = null; // Local scope filter handled server-side

  const scoreField: 'total_score' | 'daily_score' | 'weekly_score' =
    timeFilter === 'daily' ? 'daily_score' :
    timeFilter === 'weekly' ? 'weekly_score' : 'total_score';

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLeaderboard(timeFilter, scopeFilter, userCountry);
      setEntries(data);

      if (user) {
        const rank = await getUserRank(user.id, timeFilter, scopeFilter, userCountry);
        setUserRank(rank);
      }
    } catch (err) {
      console.error('Leaderboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [timeFilter, scopeFilter, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const isCurrentUser = (entry: LeaderboardEntry) => entry.user_id === user?.id;
  const userInTop = entries.some(isCurrentUser);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Leaderboard</Text>
            <Text style={styles.subtitle}>Top players worldwide</Text>
          </View>
          <MaterialIcons name="emoji-events" size={40} color={Colors.secondary} />
        </View>

        {/* Time filter */}
        <View style={styles.timeFilterRow}>
          {TIME_FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setTimeFilter(f.id)}
              style={({ pressed }) => [
                styles.timeFilter,
                timeFilter === f.id && styles.timeFilterActive,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.timeFilterText, timeFilter === f.id && styles.timeFilterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Scope filter */}
        <View style={styles.scopeRow}>
          {SCOPE_FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setScopeFilter(f.id)}
              style={({ pressed }) => [
                styles.scopeFilter,
                scopeFilter === f.id && styles.scopeFilterActive,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons
                name={f.id === 'local' ? 'location-on' : 'public'}
                size={14}
                color={scopeFilter === f.id ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.scopeFilterText, scopeFilter === f.id && styles.scopeFilterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Entries */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading rankings...</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="leaderboard" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Rankings Yet</Text>
            <Text style={styles.emptyText}>
              Be the first to play and claim the top spot!
            </Text>
          </View>
        ) : (
          <View style={styles.entriesContainer}>
            {entries.map((entry) => (
              <LeaderboardRow
                key={entry.user_id}
                entry={entry}
                isCurrentUser={isCurrentUser(entry)}
                scoreField={scoreField}
              />
            ))}

            {/* Pinned user rank if not in top 10 */}
            {user && !userInTop && userRank ? (
              <>
                <View style={styles.separator}>
                  <View style={styles.separatorLine} />
                  <Text style={styles.separatorText}>Your Rank</Text>
                  <View style={styles.separatorLine} />
                </View>
                <LeaderboardRow
                  entry={{
                    rank: userRank.rank,
                    user_id: user.id,
                    username: user.username ?? 'You',
                    total_score: userRank.score,
                    daily_score: userRank.score,
                    weekly_score: userRank.score,
                    country: null,
                  }}
                  isCurrentUser
                  scoreField={scoreField}
                />
              </>
            ) : null}
          </View>
        )}

        {/* Guest prompt */}
        {!user ? (
          <View style={styles.guestPrompt}>
            <MaterialIcons name="person-add" size={32} color={Colors.primary} />
            <Text style={styles.guestPromptTitle}>Sign in to appear here!</Text>
            <Text style={styles.guestPromptText}>
              Create an account to join the leaderboard and compete with players worldwide.
            </Text>
            <PrimaryButton
              label="Sign In"
              onPress={() => router.push('/login')}
              style={styles.guestBtn}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerLeft: {},
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 4,
  },
  timeFilterRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeFilter: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  timeFilterActive: {
    backgroundColor: Colors.surface2,
  },
  timeFilterText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  timeFilterTextActive: {
    color: Colors.text,
    fontWeight: FontWeight.bold,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  scopeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  scopeFilterActive: {
    borderColor: Colors.primary + '66',
    backgroundColor: Colors.primary + '11',
  },
  scopeFilterText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  scopeFilterTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  entriesContainer: {
    gap: 0,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  separatorText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  guestPrompt: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  guestPromptTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  guestPromptText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  guestBtn: {
    marginTop: Spacing.sm,
    minWidth: 160,
  },
});
