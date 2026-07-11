import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { GeneratedQuestion } from '@/services/aiService';

interface QuestionCardProps {
  question: GeneratedQuestion;
  categoryLabel?: string;
  categoryColor?: string;
}

export function QuestionCard({ question, categoryLabel = 'World', categoryColor = Colors.accent }: QuestionCardProps) {
  const isEstimation = question.type === 'estimation';

  return (
    <LinearGradient
      colors={isEstimation ? [Colors.surface2, '#1A2840'] : [Colors.surface2, '#1A2030']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Type badge */}
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: isEstimation ? Colors.secondaryLight + '22' : Colors.accent + '22', borderColor: isEstimation ? Colors.secondary : Colors.accent }]}>
          <MaterialIcons
            name={isEstimation ? 'calculate' : 'lightbulb'}
            size={14}
            color={isEstimation ? Colors.secondary : Colors.accent}
          />
          <Text style={[styles.typeText, { color: isEstimation ? Colors.secondary : Colors.accent }]}>
            {isEstimation ? 'Estimation' : 'Trivia'}
          </Text>
        </View>
        <View style={[styles.categoryBadge, { borderColor: categoryColor + '55' }]}>
          <Text style={[styles.categoryText, { color: categoryColor }]}>{categoryLabel}</Text>
        </View>
      </View>

      {/* Question mark decoration */}
      <View style={styles.decoration}>
        <Text style={styles.decorationText}>?</Text>
      </View>

      {/* Question text */}
      <Text style={styles.questionText}>{question.question}</Text>

      {/* Hint */}
      {question.hint ? (
        <View style={styles.hintRow}>
          <MaterialIcons name="tips-and-updates" size={14} color={Colors.textMuted} />
          <Text style={styles.hintText}>{question.hint}</Text>
        </View>
      ) : null}

      {/* Answer type indicator */}
      <View style={styles.answerTypeRow}>
        <MaterialIcons
          name={isEstimation ? 'pin' : 'text-fields'}
          size={14}
          color={Colors.textMuted}
        />
        <Text style={styles.answerTypeText}>
          {isEstimation ? 'Enter a number' : 'Type your answer'}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.lg,
    overflow: 'hidden',
    minHeight: 220,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  typeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  decoration: {
    position: 'absolute',
    right: -10,
    top: 20,
    opacity: 0.04,
  },
  decorationText: {
    fontSize: 160,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  questionText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 30,
    marginBottom: Spacing.md,
    flex: 1,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  hintText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  answerTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  answerTypeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
