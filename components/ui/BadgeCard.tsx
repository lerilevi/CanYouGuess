import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface BadgeCardProps {
  id: string;
  label: string;
  description: string;
  emoji: string;
  color: string;
  earned: boolean;
}

export function BadgeCard({ label, description, emoji, color, earned }: BadgeCardProps) {
  return (
    <View style={[styles.badge, !earned && styles.badgeLocked]}>
      <View style={[styles.emojiContainer, { backgroundColor: earned ? color + '22' : Colors.surface3, borderColor: earned ? color + '55' : Colors.border }]}>
        <Text style={[styles.emoji, !earned && styles.emojiLocked]}>{emoji}</Text>
      </View>
      <Text style={[styles.label, !earned && styles.labelLocked]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.desc, !earned && styles.descLocked]} numberOfLines={2}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  badgeLocked: {
    opacity: 0.45,
  },
  emojiContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  emoji: {
    fontSize: 28,
  },
  emojiLocked: {
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  labelLocked: {
    color: Colors.textMuted,
  },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  descLocked: {
    color: Colors.textMuted,
  },
});
