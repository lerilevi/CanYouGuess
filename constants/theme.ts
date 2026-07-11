// Can You Guess? — Design Tokens
// Quiz-show aesthetic: dark navy base, electric orange + gold palette

export const Colors = {
  // Backgrounds
  background: '#080D1A',
  surface: '#0F1829',
  surface2: '#182033',
  surface3: '#1E2840',
  border: '#253047',
  borderLight: '#2D3A55',

  // Brand
  primary: '#FF6B35',       // Electric orange
  primaryLight: '#FF8C60',
  primaryDark: '#E05520' as string,
  secondary: '#FFC43D',     // Quiz-show gold
  secondaryLight: '#FFD56B',
  accent: '#00D4FF',        // Electric cyan accent

  // Semantic
  success: '#2ECC71',
  successBg: '#0F2D1F',
  error: '#FF4757',
  errorBg: '#2D0F15',
  warning: '#FFC43D',
  warningBg: '#2D2010',
  info: '#00D4FF',
  infoBg: '#0A2030',

  // Text
  text: '#FFFFFF',
  textSecondary: '#8A9BB8',
  textMuted: '#4A5568',
  textInverse: '#080D1A',

  // Premium
  premium: '#FFC43D',
  premiumGradient: ['#FFC43D', '#FF9500'],

  // Gradients (start → end)
  gradientOrange: ['#FF6B35', '#FF9500'] as const,
  gradientGold: ['#FFC43D', '#FF8C00'] as const,
  gradientCard: ['#182033', '#0F1829'] as const,
  gradientHero: ['#FF6B35', '#FFC43D'] as const,
  gradientBlue: ['#00D4FF', '#0080FF'] as const,

  // Overlay
  overlay: 'rgba(8, 13, 26, 0.85)',
  overlayLight: 'rgba(8, 13, 26, 0.6)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 40,
  hero: 52,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  }),
};
