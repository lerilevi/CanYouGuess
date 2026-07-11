import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  const sizeStyles = {
    sm: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, fontSize: FontSize.sm },
    md: { paddingVertical: 14, paddingHorizontal: Spacing.lg, fontSize: FontSize.base },
    lg: { paddingVertical: 18, paddingHorizontal: Spacing.xl, fontSize: FontSize.lg },
  };

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [style, { opacity: pressed || isDisabled ? 0.7 : 1 }]}
        hitSlop={4}
      >
        <LinearGradient
          colors={isDisabled ? [Colors.surface3, Colors.surface2] : [Colors.primary, Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.base, { paddingVertical: sizeStyles[size].paddingVertical, paddingHorizontal: sizeStyles[size].paddingHorizontal }]}
        >
          {loading ? (
            <ActivityIndicator color={Colors.text} size="small" />
          ) : (
            <Text style={[styles.text, { fontSize: sizeStyles[size].fontSize }, textStyle]}>{label}</Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          styles.secondary,
          { paddingVertical: sizeStyles[size].paddingVertical, paddingHorizontal: sizeStyles[size].paddingHorizontal },
          { opacity: pressed || isDisabled ? 0.7 : 1 },
          style,
        ]}
        hitSlop={4}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="small" />
        ) : (
          <Text style={[styles.text, styles.secondaryText, { fontSize: sizeStyles[size].fontSize }, textStyle]}>{label}</Text>
        )}
      </Pressable>
    );
  }

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          { paddingVertical: sizeStyles[size].paddingVertical, paddingHorizontal: sizeStyles[size].paddingHorizontal },
          { opacity: pressed || isDisabled ? 0.5 : 1 },
          style,
        ]}
        hitSlop={4}
      >
        <Text style={[styles.text, styles.ghostText, { fontSize: sizeStyles[size].fontSize }, textStyle]}>{label}</Text>
      </Pressable>
    );
  }

  // danger
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles.danger,
        { paddingVertical: sizeStyles[size].paddingVertical, paddingHorizontal: sizeStyles[size].paddingHorizontal },
        { opacity: pressed || isDisabled ? 0.7 : 1 },
        style,
      ]}
      hitSlop={4}
    >
      {loading ? (
        <ActivityIndicator color={Colors.text} size="small" />
      ) : (
        <Text style={[styles.text, { fontSize: sizeStyles[size].fontSize }, textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: Colors.surface2,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  danger: {
    backgroundColor: Colors.error,
  },
  text: {
    color: Colors.text,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  secondaryText: {
    color: Colors.primary,
  },
  ghostText: {
    color: Colors.textSecondary,
  },
});
