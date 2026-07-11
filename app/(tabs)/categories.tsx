import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { useGame } from '@/hooks/useGame';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useUserCountry } from '@/hooks/useUserCountry';
import { CategoryCard } from '@/components/ui/CategoryCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { PaywallScreen } from '@/components/feature/PaywallScreen';
import { CATEGORIES } from '@/constants/config';
import { getCategoryScores, CategoryScore } from '@/services/profileService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export default function CategoriesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isPaid } = useSubscriptionStatus();
  const {
    startNewQuestion,
    consentGiven,
    setConsentGiven,
    isPaidLockedCategory,
    questionTypePreference,
    setQuestionTypePreference,
  } = useGame();

  const [categoryScores, setCategoryScores] = useState<CategoryScore[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const { country, loading: countryLoading, permissionDenied, requestCountry } = useUserCountry();

  // Build dynamic categories with resolved country name
  const resolvedCategories = CATEGORIES.map((cat) => {
    if (cat.id !== 'my_country') return cat;
    if (country) {
      return {
        ...cat,
        label: country.name,
        emoji: country.flag,
        description: `Questions about ${country.name}`,
      };
    }
    return cat;
  });

  useEffect(() => {
    if (user) {
      getCategoryScores(user.id).then(setCategoryScores);
    }
  }, [user]);

  const getHighestScore = (categoryId: string): number | undefined => {
    const cs = categoryScores.find((s) => s.category === categoryId);
    return cs?.highest_score;
  };

  const handleCategoryPress = (categoryId: string) => {
    if (isPaidLockedCategory(categoryId)) {
      setShowPaywall(true);
      return;
    }
    if (!consentGiven) {
      setConsentGiven(true);
    }
    startNewQuestion(categoryId, country?.name);
    router.push('/(tabs)');
  };

  const freeCats = resolvedCategories.filter((c) => !c.premium);
  const premiumCats = resolvedCategories.filter((c) => c.premium);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Categories</Text>
          <Text style={styles.subtitle}>
            {isPaid ? 'All categories unlocked' : '2 free · Purchase to unlock all'}
          </Text>
        </View>

        {/* Question type selector — paid users only */}
        {isPaid ? (
          <View style={styles.typeSelector}>
            <Text style={styles.typeSelectorLabel}>Question Type:</Text>
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

        {/* Location banner */}
        {permissionDenied ? (
          <Pressable
            onPress={requestCountry}
            style={({ pressed }) => [styles.locationBanner, { opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="location-off" size={18} color={Colors.warning} />
            <Text style={styles.locationBannerText}>
              Enable location to personalize "My Country"
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={Colors.warning} />
          </Pressable>
        ) : null}

        {/* Free categories */}
        <Text style={styles.sectionLabel}>Free</Text>
        <View style={styles.grid}>
          {freeCats.map((cat) => (
            <CategoryCard
              key={cat.id}
              {...cat}
              isLocked={false}
              highestScore={getHighestScore(cat.id)}
              onPress={() => handleCategoryPress(cat.id)}
            />
          ))}
        </View>

        {/* Locked categories */}
        <View style={styles.premiumHeader}>
          <Text style={styles.sectionLabel}>Full Game Only</Text>
          {isPaid ? (
            <View style={styles.unlockedBadge}>
              <MaterialIcons name="star" size={12} color={Colors.secondary} />
              <Text style={styles.unlockedBadgeText}>Unlocked</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowPaywall(true)}
              style={({ pressed }) => [styles.unlockBadge, { opacity: pressed ? 0.75 : 1 }]}
            >
              <MaterialIcons name="lock-open" size={12} color={Colors.primary} />
              <Text style={styles.unlockBadgeText}>Unlock Full Game</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.grid}>
          {premiumCats.map((cat) => (
            <CategoryCard
              key={cat.id}
              {...cat}
              isLocked={isPaidLockedCategory(cat.id)}
              highestScore={getHighestScore(cat.id)}
              onPress={() => handleCategoryPress(cat.id)}
            />
          ))}
        </View>

        {/* Full Game CTA for non-paid users */}
        {!isPaid ? (
          <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.ctaCard}>
            <View style={styles.ctaBadge}>
              <MaterialIcons name="bolt" size={16} color={Colors.secondary} />
              <Text style={styles.ctaBadgeText}>ONE-TIME PURCHASE</Text>
            </View>
            <Text style={styles.ctaTitle}>Unlock Full Game</Text>
            <Text style={styles.ctaText}>
              Get lifetime access to all 7 categories, unlimited daily questions, and an ad-free experience.
            </Text>
            <View style={styles.ctaBenefits}>
              {[
                'All 7 categories',
                'Unlimited questions',
                'Ad-free experience',
                'Lifetime access',
              ].map((b, i) => (
                <View key={i} style={styles.ctaBenefitRow}>
                  <MaterialIcons name="check-circle" size={14} color={Colors.primary} />
                  <Text style={styles.ctaBenefitText}>{b}</Text>
                </View>
              ))}
            </View>
            <PrimaryButton
              label="Get Lifetime Access"
              onPress={() => setShowPaywall(true)}
              style={styles.ctaBtn}
            />
            {/* Sign-in nudge — clearly separate from premium */}
            {!user ? (
              <Pressable
                onPress={() => setShowSignInPrompt(true)}
                style={styles.signInNudge}
                hitSlop={4}
              >
                <Text style={styles.signInNudgeText}>
                  Already have an account?{' '}
                  <Text style={styles.signInNudgeLink}>Sign in to sync progress</Text>
                </Text>
              </Pressable>
            ) : null}
          </LinearGradient>
        ) : null}
      </ScrollView>

      {/* Paywall — one-time purchase */}
      <PaywallScreen
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        trigger="category"
      />

      {/* Sign-in prompt for guests */}
      <Modal
        visible={showSignInPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignInPrompt(false)}
      >
        <View style={styles.signUpOverlay}>
          <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.signUpModal}>
            <MaterialIcons name="sync" size={40} color={Colors.primary} />
            <Text style={styles.signUpModalTitle}>Save Your Progress</Text>
            <Text style={styles.signUpModalText}>
              Create a free account to sync your stats and streak across devices, and appear on the leaderboard.
            </Text>
            <Text style={styles.signUpNote}>
              Signing in does not unlock premium features — only the Full Game purchase does.
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
  header: { marginBottom: Spacing.lg },
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
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typeSelector: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  typeSelectorLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    marginBottom: Spacing.md,
  },
  locationBannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  unlockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '1A',
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  unlockBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary + '22',
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.secondary + '55',
  },
  unlockedBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.semibold,
  },
  ctaCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    marginTop: Spacing.sm,
  },
  ctaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary + '22',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.secondary + '55',
  },
  ctaBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.black,
    letterSpacing: 0.5,
  },
  ctaTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
  },
  ctaText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  ctaBenefits: {
    width: '100%',
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ctaBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ctaBenefitText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  ctaBtn: { width: '100%' },
  signInNudge: { paddingVertical: 4 },
  signInNudgeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  signInNudgeLink: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    textDecorationLine: 'underline',
  },
  // Sign-in modal
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
    alignItems: 'center',
  },
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
  signUpNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  signUpModalBtn: { width: '100%' },
  signUpDismiss: { paddingVertical: Spacing.sm },
  signUpDismissText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
