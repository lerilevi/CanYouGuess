import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export const ONBOARDING_KEY = '@canyouguess_onboarding_v1';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Slide data ────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'welcome',
    emoji: '🎯',
    emojiGradient: [Colors.primary, Colors.secondary] as const,
    title: 'Welcome to\nCan You Guess?',
    subtitle: 'Test your knowledge with estimation challenges and trivia questions across dozens of categories.',
    bullets: [
      { icon: 'grid-view' as const, text: '7 categories from Science to Sports' },
      { icon: 'emoji-events' as const, text: 'Earn badges and climb the leaderboard' },
      { icon: 'local-fire-department' as const, text: 'Keep your daily streak alive' },
    ],
  },
  {
    id: 'question_types',
    emoji: '🔢',
    emojiGradient: [Colors.accent, '#0080FF'] as const,
    title: 'Two Types\nof Questions',
    subtitle: 'Every question is one of two styles — both are scored up to 100 points.',
    cards: [
      {
        icon: 'calculate' as const,
        color: Colors.secondary,
        title: 'Estimation',
        description: 'Guess a numeric answer. The closer you are, the higher your score.\n\nExample: "How many bones are in the human body?"',
      },
      {
        icon: 'lightbulb' as const,
        color: Colors.primary,
        title: 'Trivia',
        description: 'Answer factual multiple-choice or open questions correctly.\n\nExample: "What year did the Berlin Wall fall?"',
      },
    ],
  },
  {
    id: 'scoring',
    emoji: '🏆',
    emojiGradient: [Colors.secondary, Colors.primaryLight] as const,
    title: 'How Scoring\nWorks',
    subtitle: 'Points are awarded based on how close your answer is to the real value.',
    tiers: [
      {
        range: '90 – 100 pts',
        label: 'Spot On!',
        detail: 'Under 5% off the real answer',
        color: Colors.success,
        bg: Colors.successBg,
        icon: 'stars' as const,
      },
      {
        range: '60 – 89 pts',
        label: 'Close!',
        detail: '5% – 30% off the real answer',
        color: Colors.secondary,
        bg: Colors.warningBg,
        icon: 'thumb-up' as const,
      },
      {
        range: '1 – 59 pts',
        label: 'Getting There',
        detail: 'Over 30% off the real answer',
        color: Colors.textSecondary,
        bg: Colors.surface3,
        icon: 'trending-up' as const,
      },
    ],
    note: '15 free questions per day · Watch ads to earn up to 3 bonus questions',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Animated value tracking scroll offset for dot expansion
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
        setActiveIndex(idx);
      },
    }
  );

  const goNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * SCREEN_WIDTH, animated: true });
    } else {
      await finishOnboarding();
    }
  };

  const skipOnboarding = async () => {
    await finishOnboarding();
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'done');
    } catch {}
    router.replace('/(tabs)');
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Skip button */}
      <View style={[styles.skipRow, { paddingTop: insets.top + Spacing.sm }]}>
        {!isLast ? (
          <Pressable onPress={skipOnboarding} hitSlop={12} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

      {/* Slides */}
      <Animated.ScrollView
        ref={scrollRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.id} style={styles.slide}>
            {/* Emoji hero */}
            <LinearGradient
              colors={slide.emojiGradient}
              style={styles.emojiRing}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.emoji}>{slide.emoji}</Text>
            </LinearGradient>

            {/* Title */}
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>

            {/* Slide-specific content */}
            {slide.bullets ? (
              <View style={styles.bulletsContainer}>
                {slide.bullets.map((b, bi) => (
                  <View key={bi} style={styles.bulletRow}>
                    <View style={styles.bulletIconWrap}>
                      <MaterialIcons name={b.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.bulletText}>{b.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {slide.cards ? (
              <View style={styles.cardsContainer}>
                {slide.cards.map((card, ci) => (
                  <View key={ci} style={styles.typeCard}>
                    <View style={[styles.typeCardIconWrap, { backgroundColor: card.color + '22' }]}>
                      <MaterialIcons name={card.icon} size={24} color={card.color} />
                    </View>
                    <View style={styles.typeCardBody}>
                      <Text style={[styles.typeCardTitle, { color: card.color }]}>{card.title}</Text>
                      <Text style={styles.typeCardDesc}>{card.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {slide.tiers ? (
              <View style={styles.tiersContainer}>
                {slide.tiers.map((tier, ti) => (
                  <View key={ti} style={[styles.tierRow, { backgroundColor: tier.bg, borderColor: tier.color + '44' }]}>
                    <MaterialIcons name={tier.icon} size={22} color={tier.color} />
                    <View style={styles.tierBody}>
                      <View style={styles.tierTitleRow}>
                        <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
                        <Text style={[styles.tierRange, { color: tier.color }]}>{tier.range}</Text>
                      </View>
                      <Text style={styles.tierDetail}>{tier.detail}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.noteRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.noteText}>{slide.note}</Text>
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </Animated.ScrollView>

      {/* Dot indicators + CTA */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const dotWidth = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { width: dotWidth, opacity: dotOpacity },
                ]}
              />
            );
          })}
        </View>

        {/* Next / Let's Play! */}
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>
              {isLast ? "Let's Play!" : 'Next'}
            </Text>
            <MaterialIcons
              name={isLast ? 'play-arrow' : 'arrow-forward'}
              size={20}
              color={Colors.textInverse}
            />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 10,
  },
  skipBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  skipText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    // no flex so it lays out horizontally
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  emojiRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  // Slide 1 — bullets
  bulletsContainer: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulletIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    fontSize: FontSize.base,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  // Slide 2 — type cards
  cardsContainer: {
    width: '100%',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  typeCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'flex-start',
  },
  typeCardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typeCardBody: {
    flex: 1,
  },
  typeCardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 6,
  },
  typeCardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  // Slide 3 — tiers
  tiersContainer: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  tierBody: {
    flex: 1,
  },
  tierTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  tierLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  tierRange: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    opacity: 0.85,
  },
  tierDetail: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  noteText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    flex: 1,
  },
  // Footer
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  ctaBtn: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
  },
  ctaText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
});
