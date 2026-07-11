export const AD_CONFIG = {
  /**
   * How many result screens must pass before an interstitial is eligible.
   * e.g. 3 = show at most once every 3 completed questions.
   */
  interstitialFrequency: 3,
  /**
   * Max bonus questions a free user can earn via rewarded ads per day.
   */
  maxDailyBonusQuestions: 3,
};

export const APP_CONFIG = {
  name: 'Can You Guess?',
  version: '1.0.0',
  dailyFreeQuestions: 15,
  revenueCatKey: process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ?? '',
  // One-time non-consumable entitlement ID configured in RevenueCat dashboard
  premiumEntitlementId: 'canyouguess? Unlimited',
};

export const CATEGORIES = [
  {
    id: 'my_country',
    label: 'My Country',
    icon: 'flag',
    emoji: '🏳️',
    color: '#FF6B35',
    gradient: ['#FF6B35', '#FF9500'] as const,
    premium: false,
    description: 'Questions about your home country',
  },
  {
    id: 'world',
    label: 'World',
    icon: 'public',
    emoji: '🌍',
    color: '#00D4FF',
    gradient: ['#00D4FF', '#0080FF'] as const,
    premium: false,
    description: 'Global knowledge and geography',
  },
  {
    id: 'science',
    label: 'Science',
    icon: 'science',
    emoji: '🔬',
    color: '#2ECC71',
    gradient: ['#2ECC71', '#27AE60'] as const,
    premium: true,
    description: 'Physics, chemistry, biology & more',
  },
  {
    id: 'history',
    label: 'History',
    icon: 'history-edu',
    emoji: '📜',
    color: '#FFC43D',
    gradient: ['#FFC43D', '#FF8C00'] as const,
    premium: true,
    description: 'World history and civilizations',
  },
  {
    id: 'food_drink',
    label: 'Food & Drink',
    icon: 'restaurant',
    emoji: '🍕',
    color: '#FF4757',
    gradient: ['#FF4757', '#C0392B'] as const,
    premium: true,
    description: 'Cuisine, drinks, and culinary facts',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: 'sports-soccer',
    emoji: '⚽',
    color: '#9B59B6',
    gradient: ['#9B59B6', '#6C3483'] as const,
    premium: true,
    description: 'Athletics, teams, and records',
  },
  {
    id: 'art',
    label: 'Art',
    icon: 'palette',
    emoji: '🎨',
    color: '#E91E8C',
    gradient: ['#E91E8C', '#AD1457'] as const,
    premium: true,
    description: 'Paintings, music, literature & more',
  },
];

export const BADGES = [
  {
    id: 'first_guess',
    label: 'First Guess',
    description: 'Answered your first question',
    emoji: '🎯',
    color: '#FF6B35',
  },
  {
    id: 'sniper',
    label: 'Sniper',
    description: 'Estimation deviation under 5%',
    emoji: '🎳',
    color: '#00D4FF',
  },
  {
    id: 'marathoner',
    label: 'Marathoner',
    description: 'Played 7 days in a row',
    emoji: '🏃',
    color: '#2ECC71',
  },
  {
    id: 'category_master',
    label: 'Category Master',
    description: 'Answered 50 questions in one category',
    emoji: '🏆',
    color: '#FFC43D',
  },
];
