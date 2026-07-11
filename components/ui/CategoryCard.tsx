import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

interface CategoryCardProps {
  id: string;
  label: string;
  emoji: string;
  color: string;
  gradient: readonly [string, string];
  premium: boolean;
  isLocked: boolean;
  highestScore?: number;
  onPress: () => void;
}

export function CategoryCard({
  label,
  emoji,
  color,
  gradient,
  premium,
  isLocked,
  highestScore,
  onPress,
}: CategoryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, { opacity: pressed ? 0.85 : 1 }]}
      hitSlop={2}
    >
      <LinearGradient
        colors={gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Emoji */}
        <Text style={styles.emoji}>{emoji}</Text>

        {/* Label */}
        <Text style={styles.label}>{label}</Text>

        {/* Score */}
        {highestScore !== undefined && !isLocked ? (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>Best: {highestScore}</Text>
          </View>
        ) : null}

        {/* Lock overlay */}
        {isLocked ? (
          <View style={styles.lockOverlay}>
            <View style={styles.lockCircle}>
              <MaterialIcons name="lock" size={22} color={Colors.text} />
            </View>
            {premium ? (
              <View style={styles.premiumTag}>
                <MaterialIcons name="star" size={10} color={Colors.secondary} />
                <Text style={styles.premiumText}>Premium</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '50%',
    aspectRatio: 1,
    ...Shadow.md,
  },
  card: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emoji: {
    fontSize: 40,
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scoreBadge: {
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  scoreText: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: FontWeight.semibold,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,13,26,0.72)',
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,196,61,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.secondary + '55',
  },
  premiumText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
});
