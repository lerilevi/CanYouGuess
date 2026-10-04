import React, { createContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { useAuth } from '@/template';
import { generateQuestion, evaluateEstimation, evaluateTrivia, getPlayState,
  GeneratedQuestion, EstimationResult, TriviaResult, PlayState } from '@/services/aiService';
import { getOrCreateUserStats, getUserBadges, UserStats, UserBadge } from '@/services/profileService';
import { captureIdentity, assertCurrentIdentity, isCurrentIdentity, subscribeIdentity, IdentityScope } from '@/services/identityScope';
import { readUserCache, writeUserCache } from '@/services/userCache';
import { CATEGORIES } from '@/constants/config';
import { ownedRpc } from '@/services/ownedBackend';

export type GamePhase = 'idle'|'loading'|'question'|'answering'|'evaluating'|'result'|'error';
export interface GameResult { question:GeneratedQuestion; userAnswer:string; score:number; estimation?:EstimationResult; trivia?:TriviaResult }
export type QuestionTypePreference = 'estimation'|'trivia'|'mix';
export interface GameContextType {
  phase:GamePhase; currentQuestion:GeneratedQuestion|null; currentCategory:string;
  setCurrentCategory:(cat:string)=>void; questionTypePreference:QuestionTypePreference;
  setQuestionTypePreference:(pref:QuestionTypePreference)=>void; currentResult:GameResult|null;
  userStats:UserStats|null; userBadges:UserBadge[]; newBadges:string[];
  questionsToday:number; bonusQuestionsEarned:number; playStateKnown:boolean; consentGiven:boolean|null;
  setConsentGiven:(v:boolean)=>void; loadUserData:()=>Promise<void>;
  startNewQuestion:(category:string,country?:string)=>Promise<void>; submitAnswer:(answer:string)=>Promise<void>;
  nextQuestion:()=>void; resetGame:()=>void; canPlayToday:()=>boolean;
  isPaidLockedCategory:(id:string)=>boolean; minutesUntilReset:()=>number; clearNewBadges:()=>void;
  watchAdForBonusQuestion:()=>Promise<boolean>; canEarnMoreBonusQuestions:()=>boolean;
}
export const GameContext = createContext<GameContextType|undefined>(undefined);
const FREE_CATEGORY_IDS = ['my_country','world'];

export function GameProvider({children}:{children:ReactNode}) {
  const {user} = useAuth();
  const [phase,setPhase] = useState<GamePhase>('idle');
  const [currentQuestion,setCurrentQuestion] = useState<GeneratedQuestion|null>(null);
  const [currentResult,setCurrentResult] = useState<GameResult|null>(null);
  const [currentCategory,setCurrentCategory] = useState('world');
  const [lastCountry,setLastCountry] = useState('World');
  const [userStats,setUserStats] = useState<UserStats|null>(null);
  const [userBadges,setUserBadges] = useState<UserBadge[]>([]);
  const [newBadges,setNewBadges] = useState<string[]>([]);
  const [play,setPlay] = useState<PlayState|null>(null);
  const [consentGiven,setConsentGivenState] = useState<boolean|null>(null);
  const [questionTypePreference,setPreference] = useState<QuestionTypePreference>('mix');
  const sequence = useRef(0);
  const loadingSequence = useRef(0);
  const busy = useRef(false);
  const questionOwner = useRef<IdentityScope|null>(null);
  const serverClock = useRef({server:0,received:0});
  const applyPlay = (next:PlayState) => {
    serverClock.current = {server:Date.parse(next.server_now),received:Date.now()};
    setPlay(next);
  };
  useEffect(() => {
    const reset = () => {
      sequence.current++; loadingSequence.current++; busy.current=false; questionOwner.current=null;
      setPhase('idle'); setCurrentQuestion(null); setCurrentResult(null); setCurrentCategory('world');
      setLastCountry('World'); setUserStats(null); setUserBadges([]); setNewBadges([]);
      setPlay(null); setConsentGivenState(null); setPreference('mix');
    };
    const unsubscribe = subscribeIdentity(reset);
    return () => { sequence.current++; loadingSequence.current++; unsubscribe(); };
  }, []);
  const loadUserData = useCallback(async () => {
    if (!user) return;
    const scope = captureIdentity(user.id);
    const request = ++loadingSequence.current;
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await ownedRpc('set_my_timezone', {p_timezone:timezone}, scope).catch(() => {});
      assertCurrentIdentity(scope);
      const [stats,badges,state,notice,preference] = await Promise.all([
        getOrCreateUserStats(user.id),getUserBadges(user.id),getPlayState(scope),
        readUserCache<boolean>(scope,'ai-notice-v1'),
        readUserCache<QuestionTypePreference>(scope,'question-preference'),
      ]);
      assertCurrentIdentity(scope);
      if (request !== loadingSequence.current) return;
      setUserStats(stats); setUserBadges(badges); applyPlay(state);
      setConsentGivenState(notice); setPreference(preference ?? 'mix');
    } catch {
      if (isCurrentIdentity(scope) && request === loadingSequence.current) {
        setUserStats(null); setUserBadges([]); setPlay(null);
      }
    }
  }, [user?.id]);
  const setConsentGiven = useCallback((value:boolean) => {
    const scope = captureIdentity();
    setConsentGivenState(value);
    void writeUserCache(scope,'ai-notice-v1',value).catch(() => {
      if (isCurrentIdentity(scope)) setConsentGivenState(null);
    });
  }, []);
  const setQuestionTypePreference = useCallback((value:QuestionTypePreference) => {
    const scope = captureIdentity();
    setPreference(value);
    void writeUserCache(scope,'question-preference',value).catch(() => {});
  }, []);
  // UI hints only. The reservation RPC is the authority for EVERY entry path.
  const canPlayToday = useCallback(() => Boolean(user && play?.can_play),[user,play]);
  const isPaidLockedCategory = useCallback((id:string) =>
    !(play?.paid ?? false) && !FREE_CATEGORY_IDS.includes(id) && id !== 'random', [play]);
  const minutesUntilReset = useCallback(() => {
    if (!play) return 0;
    const clock = serverClock.current;
    return Math.max(0, Math.ceil((Date.parse(play.reset_at)-clock.server-(Date.now()-clock.received))/60_000));
  }, [play]);
  const startNewQuestion = useCallback(async (category:string,country='World') => {
    if (busy.current || !user || !consentGiven) return;
    const scope = captureIdentity(user.id);
    const request = ++sequence.current;
    busy.current=true; questionOwner.current=null;
    setCurrentQuestion(null); setCurrentResult(null); setNewBadges([]); setPhase('loading');
    try {
      const state = await getPlayState(scope);
      assertCurrentIdentity(scope);
      applyPlay(state);
      if (!state.can_play) throw new Error('Your server allowance is exhausted.');
      const pool = state.paid ? CATEGORIES.map(c=>c.id) : FREE_CATEGORY_IDS;
      const resolved = category === 'random' ? pool[Math.floor(Math.random()*pool.length)] : category;
      const q = await generateQuestion(resolved,country,questionTypePreference,scope);
      const after = await getPlayState(scope).catch(() => null);
      assertCurrentIdentity(scope);
      if (request !== sequence.current) return;
      if (after) applyPlay(after); else setPlay(null);
      setCurrentCategory(resolved); setLastCountry(country);
      questionOwner.current=scope; setCurrentQuestion(q); setPhase('question');
    } catch {
      if (isCurrentIdentity(scope) && request === sequence.current) setPhase('error');
    } finally { if (request === sequence.current) busy.current=false; }
  }, [user?.id,consentGiven,questionTypePreference]);
  const submitAnswer = useCallback(async (answer:string) => {
    if (!currentQuestion || !questionOwner.current || busy.current) return;
    const scope = questionOwner.current;
    assertCurrentIdentity(scope);
    const question = currentQuestion;
    const request = ++sequence.current;
    busy.current=true; setPhase('evaluating');
    try {
      let result:GameResult;
      let badges:string[];
      if (question.type === 'estimation') {
        const cleaned = answer.trim().replace(/,/g,'');
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) throw new Error('Enter a number in the displayed unit.');
        const numeric = Number(cleaned);
        if (!Number.isFinite(numeric)) throw new Error('Enter a finite number.');
        const estimation = await evaluateEstimation(question.questionId,numeric,scope);
        result={question,userAnswer:answer,score:estimation.score,estimation};
        badges=estimation.stats?.new_badges ?? [];
      } else {
        const trivia = await evaluateTrivia(question.questionId,answer,scope);
        result={question,userAnswer:answer,score:trivia.score,trivia};
        badges=trivia.stats?.new_badges ?? [];
      }
      assertCurrentIdentity(scope);
      const [stats,allBadges,state] = await Promise.all([
        getOrCreateUserStats(scope.userId!).catch(() => null),
        getUserBadges(scope.userId!).catch(() => []),
        getPlayState(scope).catch(() => null),
      ]);
      assertCurrentIdentity(scope);
      if (request !== sequence.current) return;
      // Scoring already committed. A failed refresh must not discard the delivered result.
      setCurrentResult(result); setNewBadges(badges); setUserStats(stats);
      setUserBadges(allBadges);
      if (state) applyPlay(state); else setPlay(null);
      setPhase('result');
    } catch {
      if (isCurrentIdentity(scope) && request === sequence.current) setPhase('error');
    } finally { if (request === sequence.current) busy.current=false; }
  }, [currentQuestion]);
  const resetGame = useCallback(() => {
    sequence.current++; busy.current=false; questionOwner.current=null;
    setPhase('idle'); setCurrentQuestion(null); setCurrentResult(null); setNewBadges([]);
  }, []);
  const nextQuestion = useCallback(() => { void startNewQuestion(currentCategory,lastCountry); },
    [startNewQuestion,currentCategory,lastCountry]);
  // Fail closed until signed SSV + reward intents are deployed. Never mint credits from a client callback.
  const watchAdForBonusQuestion = useCallback(async () => false, []);
  const canEarnMoreBonusQuestions = useCallback(() => false, []);
  return <GameContext.Provider value={{phase,currentQuestion,currentCategory,setCurrentCategory,
    questionTypePreference,setQuestionTypePreference,currentResult,userStats,userBadges,newBadges,
    questionsToday:play?.questions_today ?? 0,bonusQuestionsEarned:play?.bonus_remaining ?? 0,playStateKnown:play!==null,
    consentGiven,setConsentGiven,loadUserData,startNewQuestion,submitAnswer,nextQuestion,resetGame,
    canPlayToday,isPaidLockedCategory,minutesUntilReset,clearNewBadges:()=>setNewBadges([]),
    watchAdForBonusQuestion,canEarnMoreBonusQuestions}}>{children}</GameContext.Provider>;
}
