import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { GameResult } from '@/contexts/GameContext';

interface ResultCardProps {
  result: GameResult;
}

export function ResultCard({ result }: ResultCardProps) {
  const { estimation, trivia, score, userAnswer } = result;
  const isCorrect = trivia?.isCorrect ?? false;
  const isEstimation = result.question.type === 'estimation';

  const scoreColor =
    score >= 80 ? Colors.success :
    score >= 50 ? Colors.secondary :
    Colors.error;

  // ── Animations ──────────────────────────────────────────────────
  const ringScale = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = React.useState(0);

  useEffect(() => {
    // Ring springs into view
    Animated.spring(ringScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 7,
    }).start();

    // Score counts up from 0 → score over 900 ms
    Animated.timing(countAnim, {
      toValue: score,
      duration: 900,
      useNativeDriver: false,
    }).start();

    const listener = countAnim.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    return () => {
      countAnim.removeListener(listener);
    };
  }, [score]);

  return (
    <LinearGradient
      colors={[Colors.surface2, Colors.surface]}
      style={styles.card}
    >
      {/* Score ring */}
      <View style={styles.scoreSection}>
        <Animated.View
          style={[
            styles.scoreRing,
            { borderColor: scoreColor },
            { transform: [{ scale: ringScale }] },
          ]}
        >
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>{displayScore}</Text>
          <Text style={styles.scoreLabel}>pts</Text>
        </Animated.View>
        <Text style={[styles.verdict, { color: scoreColor }]}>
          {estimation?.verdict ?? trivia?.verdict ?? 'Done!'}
        </Text>
      </View>

      {isEstimation && estimation ? (
        <>
          {/* User answer vs real answer */}
          <View style={styles.comparisonRow}>
            <View style={styles.compareBox}>
              <Text style={styles.compareLabel}>Your Guess</Text>
              <Text style={styles.compareValue}>{Number(userAnswer).toLocaleString()}</Text>
              <Text style={styles.compareUnit}>{estimation.unit}</Text>
            </View>
            <View style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={[styles.compareBox, styles.compareBoxRight]}>
              <Text style={styles.compareLabel}>Real Answer</Text>
              <Text style={[styles.compareValue, { color: Colors.secondary }]}>
                {estimation.estimatedAnswer.toLocaleString()}
              </Text>
              <Text style={styles.compareUnit}>{estimation.unit}</Text>
            </View>
          </View>

          {/* Deviation */}
          <View style={styles.deviationRow}>
            <MaterialIcons name="show-chart" size={16} color={scoreColor} />
            <Text style={[styles.deviationText, { color: scoreColor }]}>
              {estimation.deviationPercent.toFixed(1)}% deviation
            </Text>
          </View>

          {/* Steps */}
          <View style={styles.stepsSection}>
            <Text style={styles.stepsTitle}>How we calculated it</Text>
            {estimation.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </>
      ) : trivia ? (
        <>
          {/* Correct/Incorrect */}
          <View style={[styles.triviaResult, { backgroundColor: isCorrect ? Colors.successBg : Colors.errorBg, borderColor: isCorrect ? Colors.success : Colors.error }]}>
            <MaterialIcons
              name={isCorrect ? 'check-circle' : 'cancel'}
              size={28}
              color={isCorrect ? Colors.success : Colors.error}
            />
            <View style={styles.triviaTextBlock}>
              <Text style={[styles.triviaStatus, { color: isCorrect ? Colors.success : Colors.error }]}>
                {isCorrect ? 'Correct!' : 'Incorrect'}
              </Text>
              <Text style={styles.triviaCorrect}>
                Answer: <Text style={styles.triviaCorrectValue}>{trivia.correctAnswer}</Text>
              </Text>
            </View>
          </View>

          {/* Explanation */}
          {trivia.explanation ? (
            <View style={styles.explanationBox}>
              <Text style={styles.explanationText}>{trivia.explanation}</Text>
            </View>
          ) : null}
        </>
      ) : null}
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
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  scoreRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  scoreNumber: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
  },
  scoreLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginTop: -4,
  },
  verdict: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  compareBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compareBoxRight: {
    borderColor: Colors.secondary + '66',
  },
  compareLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  compareValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  compareUnit: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  vsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vsText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.black,
    color: Colors.textSecondary,
  },
  deviationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  deviationText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  stepsSection: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepsTitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  stepText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  triviaResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  triviaTextBlock: {
    flex: 1,
  },
  triviaStatus: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  triviaCorrect: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  triviaCorrectValue: {
    color: Colors.text,
    fontWeight: FontWeight.semibold,
  },
  explanationBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explanationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
