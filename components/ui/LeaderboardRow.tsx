import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { LeaderboardEntry } from '@/services/leaderboardService';

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
  scoreField?: 'total_score' | 'daily_score' | 'weekly_score';
}

export function LeaderboardRow({
  entry,
  isCurrentUser = false,
  scoreField = 'total_score',
}: LeaderboardRowProps) {
  const rankColors: Record<number, string> = {
    1: Colors.secondary,
    2: '#C0C0C0',
    3: '#CD7F32',
  };
  const rankColor = rankColors[entry.rank] ?? Colors.textMuted;
  const score = entry[scoreField];

  return (
    <View style={[styles.row, isCurrentUser && styles.currentUserRow]}>
      {/* Rank */}
      <View style={styles.rankContainer}>
        {entry.rank <= 3 ? (
          <MaterialIcons name="emoji-events" size={20} color={rankColor} />
        ) : (
          <Text style={[styles.rankText, { color: rankColor }]}>{entry.rank}</Text>
        )}
      </View>

      {/* Avatar placeholder */}
      <View style={[styles.avatar, isCurrentUser && styles.avatarCurrent]}>
        <Text style={styles.avatarText}>
          {(entry.username ?? '?').charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Username */}
      <View style={styles.nameContainer}>
        <Text style={[styles.username, isCurrentUser && styles.usernameCurrent]} numberOfLines={1}>
          {entry.username ?? 'Anonymous'}
          {isCurrentUser ? ' (You)' : ''}
        </Text>
        {entry.country ? (
          <Text style={styles.country}>{entry.country}</Text>
        ) : null}
      </View>

      {/* Score */}
      <Text style={[styles.score, { color: entry.rank <= 3 ? rankColor : Colors.text }]}>
        {(score ?? 0).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  currentUserRow: {
    borderColor: Colors.primary + '66',
    backgroundColor: Colors.primary + '11',
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
  },
  rankText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface2,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCurrent: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  avatarText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  nameContainer: {
    flex: 1,
  },
  username: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  usernameCurrent: {
    color: Colors.primary,
  },
  country: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  score: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
