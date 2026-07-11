import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface StreakBadgeProps {
  streak: number;
  questionsToday: number;
  dailyLimit: number;
  isSubscribed: boolean;
}

export function StreakBadge({ streak, questionsToday, dailyLimit, isSubscribed }: StreakBadgeProps) {
  const remaining = isSubscribed ? null : Math.max(0, dailyLimit - questionsToday);

  return (
    <View style={styles.container}>
      <View style={styles.streakRow}>
        <MaterialIcons name="local-fire-department" size={20} color={Colors.primary} />
        <Text style={styles.streakText}>{streak} day streak</Text>
      </View>

      {!isSubscribed && remaining !== null ? (
        <View style={styles.questionRow}>
          <Text style={styles.questionText}>
            {remaining > 0
              ? `${remaining} free question${remaining !== 1 ? 's' : ''} left today`
              : 'Daily limit reached'}
          </Text>
        </View>
      ) : (
        <View style={styles.questionRow}>
          <MaterialIcons name="all-inclusive" size={14} color={Colors.success} />
          <Text style={[styles.questionText, { color: Colors.success }]}>Unlimited questions</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  questionText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
