import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/template';
import { useGame } from '@/hooks/useGame';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useUserCountry } from '@/hooks/useUserCountry';
import { QuestionCard } from '@/components/ui/QuestionCard';
import { ResultCard } from '@/components/ui/ResultCard';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ConsentModal } from '@/components/feature/ConsentModal';
import { PaywallScreen } from '@/components/feature/PaywallScreen';
import { CATEGORIES, APP_CONFIG } from '@/constants/config';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isPaid } = useSubscriptionStatus();
  const {
    phase,
    currentQuestion,
    currentCategory,
    setCurrentCategory,
    questionTypePreference,
    setQuestionTypePreference,
    currentResult,
    userStats,
    newBadges,
    questionsToday,
    bonusQuestionsEarned,
    consentGiven,
    setConsentGiven,
    loadUserData,
    startNewQuestion,
    submitAnswer,
    nextQuestion,
    resetGame,
    canPlayToday,
    isPaidLockedCategory,
    minutesUntilReset,
    clearNewBadges,
    watchAdForBonusQuestion,
    canEarnMoreBonusQuestions,
  } = useGame();
  const { country } = useUserCountry();

  // Build resolved category list with dynamic country label
  const resolvedCategories = CATEGORIES.map((cat) => {
    if (cat.id !== 'my_country' || !country) return cat;
    return { ...cat, label: country.name, emoji: country.flag };
  });

  // Add Random option at front
  const chipCategories = [
    { id: 'random', label: 'Random', emoji: '🎲', color: Colors.accent, gradient: [Colors.accent, '#0080FF'] as const, premium: false },
    ...resolvedCategories,
  ];

  const [selectedChip, setSelectedChip] = useState('random');
  const [answer, setAnswer] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<'category' | 'limit'>('category');
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const categoryData = currentCategory === 'random'
    ? chipCategories[0]
    : chipCategories.find((c) => c.id === currentCategory) ?? chipCategories[1];

  useEffect(() => {
    loadUserData();
  }, [user]);

  useEffect(() => {
    if (newBadges.length > 0) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(3000),
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => clearNewBadges());
    }
  }, [newBadges]);

  const openPaywall = (trigger: 'category' | 'limit') => {
    setPaywallTrigger(trigger);
    setShowPaywall(true);
  };

  const handleChipSelect = useCallback((chipId: string) => {
    // Guests must sign in first
    if (!user) {
      router.push('/login');
      return;
    }
    if (isPaidLockedCategory(chipId)) {
      openPaywall('category');
      return;
    }
    setSelectedChip(chipId);
    setCurrentCategory(chipId === 'random' ? 'world' : chipId);
    if (phase === 'question' || phase === 'answering' || phase === 'result') {
      resetGame();
    }
  }, [isPaidLockedCategory, phase, resetGame, setCurrentCategory]);

  const handleStartPlaying = () => {
    // Guests must sign in before playing
    if (!user) {
      router.push('/login');
      return;
    }
    if (consentGiven === null || consentGiven === false) {
      setShowConsent(true);
      return;
    }
    if (!canPlayToday()) {
      openPaywall('limit');
      return;
    }
    startNewQuestion(selectedChip, country?.name);
  };

  const handleWatchAd = async () => {
    setWatchingAd(true);
    const earned = await watchAdForBonusQuestion();
    setWatchingAd(false);
    if (earned) {
      startNewQuestion(selectedChip, country?.name);
    }
  };

  const handleConsentAccept = () => {
    setConsentGiven(true);
    setShowConsent(false);
    if (!canPlayToday()) {
      openPaywall('limit');
      return;
    }
    startNewQuestion(selectedChip, country?.name);
  };

  const handleConsentDecline = () => {
    setShowConsent(false);
    setConsentGiven(false);
  };

  const handleSubmit = () => {
    if (!answer.trim()) return;
    submitAnswer(answer.trim());
    setAnswer('');
  };

  const handleShare = async () => {
    if (!currentResult) return;
    const msg = currentResult.question.type === 'estimation'
      ? `I guessed ${currentResult.userAnswer} in "Can You Guess?" and scored ${currentResult.score}/100! My deviation was ${currentResult.estimation?.deviationPercent.toFixed(1)}%.`
      : `I got "${currentResult.trivia?.isCorrect ? 'Correct' : 'Incorrect'}" on "${currentResult.question.question}" in "Can You Guess!" Score: ${currentResult.score}/100`;
    await Share.share({ message: msg });
  };

  const remainingMinutes = minutesUntilReset();
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  const questionsLeft = APP_CONFIG.dailyFreeQuestions - questionsToday;
  const bonusAvailable = canEarnMoreBonusQuestions();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={[Colors.background, Colors.background]} style={styles.container}>
        <View style={[styles.inner, { paddingTop: insets.top }]}>
          {/* Badge notification */}
          {newBadges.length > 0 ? (
            <Animated.View style={[styles.badgeNotif, { opacity: fadeAnim }]}>
              <MaterialIcons name="emoji-events" size={20} color={Colors.secondary} />
              <Text style={styles.badgeNotifText}>
                New badge{newBadges.length > 1 ? 's' : ''} unlocked!
              </Text>
            </Animated.View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.logo}
                  contentFit="contain"
                  transition={200}
                />
                <View>
                  <Text style={styles.appTitle}>Can You Guess?</Text>
                  <Text style={styles.appTagline}>Test your estimation skills</Text>
                </View>
              </View>
              {!user ? (
                <Pressable onPress={() => router.push('/login')} style={styles.signInChip} hitSlop={8}>
                  <MaterialIcons name="login" size={14} color={Colors.primary} />
                  <Text style={styles.signInChipText}>Sign In</Text>
                </Pressable>
              ) : isPaid ? (
                <View style={styles.paidChip}>
                  <MaterialIcons name="star" size={12} color={Colors.secondary} />
                  <Text style={styles.paidChipText}>Full Game</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => router.push('/(tabs)/profile')}
                  style={({ pressed }) => [styles.userChip, { opacity: pressed ? 0.7 : 1 }]}
                  hitSlop={8}
                >
                  <MaterialIcons name="person" size={14} color={Colors.textSecondary} />
                  <Text style={styles.userChipText} numberOfLines={1}>
                    {user.username ?? user.email?.split('@')[0] ?? 'Player'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.sectionHeading}>Start Guessing</Text>

            {/* Question type selector — paid users only */}
            {isPaid ? (
              <View style={styles.typeSelector}>
                <Text style={styles.categorySelectorLabel}>Question Type:</Text>
                <View style={styles.typeSegmented}>
                  {([
                    { id: 'estimation', label: '🔢 Fermi-style' },
                    { id: 'mix', label: '🎲 Mix' },
                    { id: 'trivia', label: '📚 Trivia' },
                  ] as const).map((opt) => {
                    const isActive = questionTypePreference === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setQuestionTypePreference(opt.id)}
                        style={({ pressed }) => [
                          styles.typeSegmentBtn,
                          isActive && styles.typeSegmentBtnActive,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={[styles.typeSegmentText, isActive && styles.typeSegmentTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Category selector */}
            <View style={styles.categorySelector}>
              <Text style={styles.categorySelectorLabel}>Category:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChips}
              >
                {chipCategories.map((cat) => {
                  const isActive = selectedChip === cat.id;
                  const isLocked = isPaidLockedCategory(cat.id);
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => handleChipSelect(cat.id)}
                      style={({ pressed }) => [
                        styles.categoryChip,
                        isActive && [styles.categoryChipActive, { borderColor: cat.color, backgroundColor: cat.color + '22' }],
                        !isActive && { borderColor: Colors.border },
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={styles.categoryChipEmoji}>{cat.emoji}</Text>
                      <Text style={[styles.categoryChipText, isActive && { color: cat.color }]}>
                        {cat.label}
                      </Text>
                      {isLocked ? (
                        <MaterialIcons name="lock" size={11} color={Colors.textMuted} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Main game area */}
            {phase === 'idle' ? (
              <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.idleCard}>
                <Image
                  source={require('@/assets/images/onboarding-hero.png')}
                  style={styles.idleHero}
                  contentFit="cover"
                  transition={200}
                />
                <Text style={styles.idleTitle}>Ready to Play?</Text>
                <Text style={styles.idleSubtitle}>
                  {isPaid
                    ? 'Full access — all categories, unlimited questions!'
                    : selectedChip === 'random'
                    ? 'Questions from My Country and World — estimation and trivia!'
                    : `${chipCategories.find((c) => c.id === selectedChip)?.emoji ?? ''} questions — estimation and trivia!`}
                </Text>

                {/* Guest gate — must sign in to play */}
                {!user ? (
                  <>
                    <View style={styles.guestGateBox}>
                      <MaterialIcons name="lock" size={22} color={Colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guestGateTitle}>Sign in to play</Text>
                        <Text style={styles.guestGateDesc}>
                          Create a free account to start playing, track your streak, and compete on the leaderboard.
                        </Text>
                      </View>
                    </View>
                    <PrimaryButton
                      label="Sign In / Create Account"
                      onPress={() => router.push('/login')}
                      size="lg"
                      style={styles.startBtn}
                    />
                    <Text style={styles.guestNote}>Free account — no credit card required</Text>
                  </>
                ) : (
                  <>
                    {!canPlayToday() && !isPaid ? (
                      <View style={styles.limitBox}>
                        <MaterialIcons name="hourglass-top" size={20} color={Colors.warning} />
                        <Text style={styles.limitText}>
                          Daily limit reached. Resets in {hours}h {mins}m
                        </Text>
                      </View>
                    ) : null}

                    {/* Rewarded ad CTA — always visible when daily limit is hit for free users */}
                    {!canPlayToday() && !isPaid ? (
                      <Pressable
                        onPress={bonusAvailable ? handleWatchAd : undefined}
                        disabled={watchingAd || !bonusAvailable}
                        style={({ pressed }) => [
                          styles.rewardedAdBtn,
                          !bonusAvailable && styles.rewardedAdBtnExhausted,
                          { opacity: pressed || watchingAd ? 0.75 : 1 },
                        ]}
                      >
                        {watchingAd ? (
                          <ActivityIndicator size="small" color={Colors.secondary} />
                        ) : (
                          <MaterialIcons
                            name={bonusAvailable ? 'ondemand-video' : 'check-circle'}
                            size={20}
                            color={bonusAvailable ? Colors.secondary : Colors.textMuted}
                          />
                        )}
                        <Text style={[
                          styles.rewardedAdBtnText,
                          !bonusAvailable && styles.rewardedAdBtnTextExhausted,
                        ]}>
                          {watchingAd
                            ? 'Loading ad...'
                            : bonusAvailable
                            ? `Watch an ad for +1 question today (${bonusQuestionsEarned}/3 used)`
                            : 'Ad bonus used up for today (3/3)'}
                        </Text>
                      </Pressable>
                    ) : null}

                    <PrimaryButton
                      label={!canPlayToday() && !isPaid ? 'Unlock Full Game' : 'Start Playing'}
                      onPress={handleStartPlaying}
                      size="lg"
                      style={styles.startBtn}
                    />

                    {!isPaid ? (
                      <Text style={styles.guestNote}>
                        {questionsLeft > 0
                          ? `${questionsLeft} free question${questionsLeft !== 1 ? 's' : ''} remaining today`
                          : 'Unlock Full Game for unlimited access'}
                      </Text>
                    ) : null}
                  </>
                )}
              </LinearGradient>
            ) : null}

            {phase === 'loading' ? (
              <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.loadingCard}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Generating your question...</Text>
                <Text style={styles.loadingSubtext}>Powered by AI</Text>
              </LinearGradient>
            ) : null}

            {phase === 'error' ? (
              <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.errorCard}>
                <MaterialIcons name="wifi-off" size={48} color={Colors.error} />
                <Text style={styles.errorTitle}>Something went wrong</Text>
                <Text style={styles.errorText}>
                  Could not load a question. Please check your connection and try again.
                </Text>
                <PrimaryButton
                  label="Try Again"
                  onPress={() => startNewQuestion(selectedChip)}
                  style={styles.retryBtn}
                />
              </LinearGradient>
            ) : null}

            {(phase === 'question' || phase === 'answering') && currentQuestion ? (
              <>
                <QuestionCard
                  question={currentQuestion}
                  categoryLabel={categoryData.label}
                  categoryColor={categoryData.color}
                />
                <View style={styles.answerSection}>
                  <TextInput
                    style={styles.answerInput}
                    placeholder={
                      currentQuestion.type === 'estimation'
                        ? 'Enter your number estimate...'
                        : 'Type your answer...'
                    }
                    placeholderTextColor={Colors.textMuted}
                    value={answer}
                    onChangeText={setAnswer}
                    keyboardType={currentQuestion.type === 'estimation' ? 'numeric' : 'default'}
                    returnKeyType="done"
                    editable={phase !== 'evaluating'}
                    multiline={currentQuestion.type === 'trivia'}
                    numberOfLines={currentQuestion.type === 'trivia' ? 2 : 1}
                    accessibilityLabel="Your answer"
                  />
                  <PrimaryButton
                    label="Guess!"
                    onPress={handleSubmit}
                    disabled={!answer.trim()}
                    size="lg"
                    style={styles.guessBtn}
                  />
                </View>
              </>
            ) : null}

            {phase === 'evaluating' ? (
              <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.loadingCard}>
                <ActivityIndicator size="large" color={Colors.secondary} />
                <Text style={styles.loadingText}>Evaluating your answer...</Text>
                <Text style={styles.loadingSubtext}>AI is calculating...</Text>
              </LinearGradient>
            ) : null}

            {phase === 'result' && currentResult ? (
              <>
                <ResultCard result={currentResult} />
                <View style={styles.resultActions}>
                  <Pressable onPress={handleShare} style={styles.shareBtn} hitSlop={8}>
                    <LinearGradient
                      colors={[Colors.surface2, Colors.surface3]}
                      style={styles.shareBtnInner}
                    >
                      <MaterialIcons name="share" size={20} color={Colors.textSecondary} />
                      <Text style={styles.shareBtnText}>Share My Result</Text>
                    </LinearGradient>
                  </Pressable>
                  <PrimaryButton
                    label="Next Question"
                    onPress={() => {
                      if (!canPlayToday()) {
                        openPaywall('limit');
                        return;
                      }
                      nextQuestion();
                    }}
                    style={styles.nextBtn}
                  />
                </View>
              </>
            ) : null}

            <StreakBadge
              streak={userStats?.current_streak ?? 0}
              questionsToday={questionsToday}
              dailyLimit={isPaid ? 999 : APP_CONFIG.dailyFreeQuestions}
              isSubscribed={isPaid}
            />
          </ScrollView>

          <ConsentModal
            visible={showConsent}
            onAccept={handleConsentAccept}
            onDecline={handleConsentDecline}
          />

          {/* Paywall — one-time purchase */}
          <PaywallScreen
            visible={showPaywall}
            onClose={() => setShowPaywall(false)}
            trigger={paywallTrigger}
          />

          {/* Sign-in prompt for guests — promotes sync, not premium */}
          <Modal
            visible={showSignInPrompt}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSignInPrompt(false)}
          >
            <View style={styles.signUpOverlay}>
              <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.signUpModal}>
                <View style={styles.signUpIconRow}>
                  <MaterialIcons name="sync" size={44} color={Colors.primary} />
                </View>
                <Text style={styles.signUpModalTitle}>Save Your Progress</Text>
                <Text style={styles.signUpModalText}>
                  Sign in to sync your stats, streak, and badges across devices — and appear on the leaderboard.
                </Text>
                <View style={styles.signUpFeatures}>
                  {[
                    { icon: 'sync' as const, label: 'Sync progress across devices' },
                    { icon: 'leaderboard' as const, label: 'Appear on the leaderboard' },
                    { icon: 'local-fire-department' as const, label: 'Never lose your streak' },
                    { icon: 'emoji-events' as const, label: 'Earn badges permanently' },
                  ].map((f, i) => (
                    <View key={i} style={styles.signUpFeatureRow}>
                      <MaterialIcons name={f.icon} size={16} color={Colors.primary} />
                      <Text style={styles.signUpFeatureText}>{f.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.signUpNote}>
                  Signing in is free. It does not unlock premium features.
                </Text>
                <PrimaryButton
                  label="Sign In / Create Account"
                  onPress={() => {
                    setShowSignInPrompt(false);
                    router.push('/login');
                  }}
                  style={styles.signUpModalBtn}
                />
                <Pressable
                  onPress={() => setShowSignInPrompt(false)}
                  style={styles.signUpDismiss}
                  hitSlop={8}
                >
                  <Text style={styles.signUpDismissText}>Maybe later</Text>
                </Pressable>
              </LinearGradient>
            </View>
          </Modal>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  inner: { flex: 1 },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  badgeNotif: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondary + 'EE',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.md,
  },
  badgeNotifText: {
    color: Colors.textInverse,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  appTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  appTagline: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  signInChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '1A',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  signInChipText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  paidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary + '22',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.secondary + '55',
  },
  paidChipText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.bold,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 120,
  },
  userChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  sectionHeading: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  typeSelector: { gap: Spacing.sm },
  typeSegmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeSegmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  typeSegmentBtnActive: { backgroundColor: Colors.primary },
  typeSegmentText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  typeSegmentTextActive: {
    color: Colors.textInverse,
    fontWeight: FontWeight.bold,
  },
  categorySelector: { gap: Spacing.sm },
  categorySelectorLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  categoryChipActive: { borderWidth: 1.5 },
  categoryChipEmoji: { fontSize: 14 },
  categoryChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  idleCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.lg,
  },
  idleHero: { width: '100%', height: 200 },
  idleTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    textAlign: 'center',
  },
  idleSubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  limitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  limitText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  startBtn: { width: '90%', marginBottom: Spacing.md },
  guestNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  guestGateBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.primary + '12',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    width: '90%',
  },
  guestGateTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  guestGateDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  rewardedAdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondary + '18',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.secondary + '55',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    minHeight: 48,
  },
  rewardedAdBtnExhausted: {
    backgroundColor: Colors.surface3,
    borderColor: Colors.border,
  },
  rewardedAdBtnText: {
    fontSize: FontSize.sm,
    color: Colors.secondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    flex: 1,
  },
  rewardedAdBtnTextExhausted: {
    color: Colors.textMuted,
  },
  signInNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.lg,
  },
  signInNudgeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  loadingCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.lg,
  },
  loadingText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  loadingSubtext: { fontSize: FontSize.sm, color: Colors.textMuted },
  errorCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.errorBg,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.md,
  },
  errorTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  errorText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: { marginTop: Spacing.sm },
  answerSection: { gap: Spacing.md },
  answerInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    fontSize: FontSize.lg,
    color: Colors.text,
    borderWidth: 1.5,
    borderColor: Colors.border,
    fontWeight: FontWeight.medium,
    minHeight: 58,
    textAlignVertical: 'top',
  },
  guessBtn: { width: '100%' },
  resultActions: { gap: Spacing.md },
  shareBtn: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  shareBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shareBtnText: {
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.base,
  },
  nextBtn: { width: '100%' },
  signUpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  signUpModal: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.lg,
  },
  signUpIconRow: { alignItems: 'center' },
  signUpModalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
  },
  signUpModalText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  signUpFeatures: {
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signUpFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  signUpFeatureText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  signUpNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  signUpModalBtn: { width: '100%' },
  signUpDismiss: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  signUpDismissText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
