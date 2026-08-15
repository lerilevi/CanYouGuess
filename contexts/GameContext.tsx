import React, { createContext, useState, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/template';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import {
  generateQuestion,
  evaluateEstimation,
  evaluateTrivia,
  GeneratedQuestion,
  EstimationResult,
  TriviaResult,
} from '@/services/aiService';
import {
  getOrCreateUserStats,
  updateUserStats,
  updateCategoryScore,
  awardBadge,
  getUserBadges,
  saveUserCountry,
  UserStats,
  UserBadge,
} from '@/services/profileService';
import { detectCountryByIP } from '@/hooks/useUserCountry';
import { showInterstitial, showRewardedAd, preloadInterstitial } from '@/services/adService';
import { APP_CONFIG, AD_CONFIG, CATEGORIES } from '@/constants/config';

export type GamePhase = 'idle' | 'loading' | 'question' | 'answering' | 'evaluating' | 'result' | 'error';

export interface GameResult {
  question: GeneratedQuestion;
  userAnswer: string;
  score: number;
  estimation?: EstimationResult;
  trivia?: TriviaResult;
}

export type QuestionTypePreference = 'estimation' | 'trivia' | 'mix';

export interface GameContextType {
  phase: GamePhase;
  currentQuestion: GeneratedQuestion | null;
  currentCategory: string;
  setCurrentCategory: (cat: string) => void;
  questionTypePreference: QuestionTypePreference;
  setQuestionTypePreference: (pref: QuestionTypePreference) => void;
  currentResult: GameResult | null;
  userStats: UserStats | null;
  userBadges: UserBadge[];
  newBadges: string[];
  questionsToday: number;
  bonusQuestionsEarned: number;
  consentGiven: boolean | null;
  setConsentGiven: (v: boolean) => void;
  loadUserData: () => Promise<void>;
  startNewQuestion: (category: string, country?: string) => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  nextQuestion: () => void;
  resetGame: () => void;
  canPlayToday: () => boolean;
  isPaidLockedCategory: (categoryId: string) => boolean;
  minutesUntilReset: () => number;
  clearNewBadges: () => void;
  watchAdForBonusQuestion: () => Promise<boolean>;
  canEarnMoreBonusQuestions: () => boolean;
}

export const GameContext = createContext<GameContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = '@canyouguess_guest';
const CONSENT_STORAGE_KEY = '@canyouguess_consent';
const BONUS_STORAGE_KEY = '@canyouguess_bonus';
// Free tier: only these categories accessible without purchase
const FREE_CATEGORY_IDS = ['my_country', 'world'];

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isPaid } = useSubscriptionStatus();

  const [phase, setPhase] = useState<GamePhase>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null);
  const [currentCategory, setCurrentCategory] = useState('world');
  const [lastCountry, setLastCountry] = useState('World');
  const [currentResult, setCurrentResult] = useState<GameResult | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [questionsToday, setQuestionsToday] = useState(0);
  const [bonusQuestionsEarned, setBonusQuestionsEarned] = useState(0);
  const [consentGiven, setConsentGivenState] = useState<boolean | null>(null);
  const [questionTypePreference, setQuestionTypePreferenceState] = useState<QuestionTypePreference>('mix');

  // Interstitial frequency cap: count result screens since last interstitial
  const resultsSinceLastInterstitial = useRef(0);

  const setConsentGiven = useCallback(async (v: boolean) => {
    setConsentGivenState(v);
    await AsyncStorage.setItem(CONSENT_STORAGE_KEY, v ? 'true' : 'false');
  }, []);

  const setQuestionTypePreference = useCallback((pref: QuestionTypePreference) => {
    setQuestionTypePreferenceState(pref);
  }, []);

  // ─── Load bonus question count (persisted per day) ──────────────────────
  const loadBonusCount = useCallback(async (): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(BONUS_STORAGE_KEY);
      if (!raw) return 0;
      const { date, count } = JSON.parse(raw);
      if (date === new Date().toDateString()) return count as number;
      return 0;
    } catch {
      return 0;
    }
  }, []);

  const saveBonusCount = useCallback(async (count: number) => {
    await AsyncStorage.setItem(
      BONUS_STORAGE_KEY,
      JSON.stringify({ date: new Date().toDateString(), count })
    );
  }, []);

  const loadUserData = useCallback(async () => {
    const consent = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
    if (consent !== null) setConsentGivenState(consent === 'true');

    const bonus = await loadBonusCount();
    setBonusQuestionsEarned(bonus);

    if (user) {
      const stats = await getOrCreateUserStats(user.id);
      if (stats) {
        setUserStats(stats);
        setQuestionsToday(stats.questions_today);
      }
      const badges = await getUserBadges(user.id);
      setUserBadges(badges);

      // Detect country via IP on every app open and update the profile if it changed.
      // detectCountryByIP() always fetches fresh (falls back to cached value on failure),
      // so the "My Country" category and leaderboard always reflect current location.
      detectCountryByIP().then((detected) => {
        if (detected && detected.code !== stats?.country) {
          saveUserCountry(user.id, detected.code).catch(() => {});
        }
      }).catch(() => {});
    } else {
      const raw = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const today = new Date().toDateString();
        const questionsOnDate = data.date === today ? (data.questionsToday ?? 0) : 0;
        setQuestionsToday(questionsOnDate);
        setUserBadges(data.badges ?? []);
        setUserStats(data.stats ?? null);
      }
    }

    // Pre-load interstitial for free users
    if (!isPaid) {
      preloadInterstitial();
    }
  }, [user, isPaid, loadBonusCount]);

  // ─── Play gate ──────────────────────────────────────────────────────────
  /** Paid: unlimited. Free: base limit + bonus questions earned via rewarded ads. */
  const canPlayToday = useCallback(() => {
    if (isPaid) return true;
    return questionsToday < APP_CONFIG.dailyFreeQuestions + bonusQuestionsEarned;
  }, [isPaid, questionsToday, bonusQuestionsEarned]);

  const canEarnMoreBonusQuestions = useCallback(() => {
    if (isPaid) return false;
    return bonusQuestionsEarned < AD_CONFIG.maxDailyBonusQuestions;
  }, [isPaid, bonusQuestionsEarned]);

  // Premium categories locked unless purchased
  const isPaidLockedCategory = useCallback((categoryId: string) => {
    if (isPaid) return false;
    return !FREE_CATEGORY_IDS.includes(categoryId) && categoryId !== 'random';
  }, [isPaid]);

  const minutesUntilReset = useCallback(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.ceil((midnight.getTime() - now.getTime()) / 60000);
  }, []);

  // ─── Rewarded ad → bonus question ───────────────────────────────────────
  const watchAdForBonusQuestion = useCallback(async (): Promise<boolean> => {
    if (isPaid) return false;
    if (!canEarnMoreBonusQuestions()) return false;

    const earned = await showRewardedAd();
    if (earned) {
      const newCount = bonusQuestionsEarned + 1;
      setBonusQuestionsEarned(newCount);
      await saveBonusCount(newCount);
      return true;
    }
    return false;
  }, [isPaid, canEarnMoreBonusQuestions, bonusQuestionsEarned, saveBonusCount]);

  // ─── Question generation ────────────────────────────────────────────────
  const startNewQuestion = useCallback(async (category: string, country: string = 'World') => {
    setLastCountry(country);
    let resolvedCategory = category;
    if (category === 'random') {
      const pool = isPaid ? CATEGORIES.map((c) => c.id) : FREE_CATEGORY_IDS;
      resolvedCategory = pool[Math.floor(Math.random() * pool.length)];
    }
    setCurrentCategory(resolvedCategory);
    setPhase('loading');
    setCurrentResult(null);
    try {
      const q = await generateQuestion(resolvedCategory, country || 'World', questionTypePreference);
      setCurrentQuestion(q);
      setPhase('question');
    } catch (err) {
      console.error('Generate question error:', err);
      setPhase('error');
    }
  }, [isPaid, questionTypePreference]);

  // ─── Badges ─────────────────────────────────────────────────────────────
  const checkAndAwardBadges = useCallback(async (
    score: number,
    questionType: string,
    deviationPercent?: number
  ) => {
    const awarded: string[] = [];
    const existingIds = userBadges.map((b) => b.badge_id);

    if (!existingIds.includes('first_guess')) {
      const newBadge: UserBadge = {
        id: Date.now().toString(),
        user_id: user?.id ?? 'guest',
        badge_id: 'first_guess',
        earned_at: new Date().toISOString(),
      };
      setUserBadges((prev) => [...prev, newBadge]);
      awarded.push('first_guess');
      if (user) await awardBadge(user.id, 'first_guess');
    }

    if (
      questionType === 'estimation' &&
      deviationPercent !== undefined &&
      deviationPercent < 5 &&
      !existingIds.includes('sniper')
    ) {
      const newBadge: UserBadge = {
        id: (Date.now() + 1).toString(),
        user_id: user?.id ?? 'guest',
        badge_id: 'sniper',
        earned_at: new Date().toISOString(),
      };
      setUserBadges((prev) => [...prev, newBadge]);
      awarded.push('sniper');
      if (user) await awardBadge(user.id, 'sniper');
    }

    if (awarded.length > 0) setNewBadges(awarded);
  }, [userBadges, user]);

  // ─── Submit answer ──────────────────────────────────────────────────────
  const submitAnswer = useCallback(async (answer: string) => {
    if (!currentQuestion) return;
    setPhase('evaluating');

    try {
      let result: GameResult;

      if (currentQuestion.type === 'estimation') {
        const numAnswer = parseFloat(answer.replace(/,/g, '')) || 0;
        const estimation = await evaluateEstimation(currentQuestion.question, numAnswer);
        result = {
          question: currentQuestion,
          userAnswer: answer,
          score: estimation.score,
          estimation,
        };
        await checkAndAwardBadges(estimation.score, 'estimation', estimation.deviationPercent);
      } else {
        const trivia = await evaluateTrivia(
          currentQuestion.question,
          currentQuestion.correctAnswer ?? '',
          answer
        );
        result = {
          question: currentQuestion,
          userAnswer: answer,
          score: trivia.score,
          trivia,
        };
        await checkAndAwardBadges(trivia.score, 'trivia');
      }

      setCurrentResult(result);

      const newQuestionsToday = questionsToday + 1;
      setQuestionsToday(newQuestionsToday);

      if (user) {
        await updateUserStats(user.id, result.score, user.username ?? user.email?.split('@')[0] ?? 'Player');
        await updateCategoryScore(user.id, currentCategory, result.score);
        const stats = await getOrCreateUserStats(user.id);
        if (stats) setUserStats(stats);

        if (stats && stats.current_streak >= 7 && !userBadges.find((b) => b.badge_id === 'marathoner')) {
          await awardBadge(user.id, 'marathoner');
          const badge: UserBadge = {
            id: Date.now().toString(),
            user_id: user.id,
            badge_id: 'marathoner',
            earned_at: new Date().toISOString(),
          };
          setUserBadges((prev) => [...prev, badge]);
          setNewBadges((prev) => [...prev, 'marathoner']);
        }
      } else {
        const raw = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        const today = new Date().toDateString();
        const guestStats = {
          total_score: ((data.stats?.total_score ?? 0) + result.score),
          total_questions: ((data.stats?.total_questions ?? 0) + 1),
          current_streak: 1,
          longest_streak: 1,
        };
        await AsyncStorage.setItem(
          GUEST_STORAGE_KEY,
          JSON.stringify({
            ...data,
            date: today,
            questionsToday: newQuestionsToday,
            badges: userBadges,
            stats: guestStats,
          })
        );
        setUserStats(guestStats as UserStats);
      }

      setPhase('result');

      // ── Interstitial: show to free users at natural break (after result) ──
      // Only once every N results to avoid feeling spammy.
      if (!isPaid) {
        resultsSinceLastInterstitial.current += 1;
        if (resultsSinceLastInterstitial.current >= AD_CONFIG.interstitialFrequency) {
          resultsSinceLastInterstitial.current = 0;
          // Fire-and-forget — doesn't block UI
          showInterstitial().then(() => {
            // Pre-load next one after it closes
            setTimeout(preloadInterstitial, 3000);
          });
        }
      }
    } catch (err) {
      console.error('Evaluate error:', err);
      setPhase('error');
    }
  }, [currentQuestion, currentCategory, questionsToday, user, userBadges, checkAndAwardBadges, isPaid]);

  const nextQuestion = useCallback(() => {
    setPhase('idle');
    setCurrentQuestion(null);
    setCurrentResult(null);
    startNewQuestion(currentCategory, lastCountry);
  }, [currentCategory, lastCountry, startNewQuestion]);

  const resetGame = useCallback(() => {
    setPhase('idle');
    setCurrentQuestion(null);
    setCurrentResult(null);
  }, []);

  const clearNewBadges = useCallback(() => setNewBadges([]), []);

  return (
    <GameContext.Provider value={{
      phase,
      currentQuestion,
      currentCategory,
      setCurrentCategory,
      questionTypePreference,
      setQuestionTypePreference,
      currentResult,
      userStats,
      userBadges,
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
    }}>
      {children}
    </GameContext.Provider>
  );
}
