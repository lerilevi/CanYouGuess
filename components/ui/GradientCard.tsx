import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Shadow } from '@/constants/theme';

interface GradientCardProps {
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  children: React.ReactNode;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export function GradientCard({
  colors = [Colors.surface2, Colors.surface],
  style,
  children,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
}: GradientCardProps) {
  return (
    <LinearGradient
      colors={colors}
      start={start}
      end={end}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
});
