import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

interface ConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentModal({ visible, onAccept, onDecline }: ConsentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <LinearGradient
          colors={[Colors.surface2, Colors.surface]}
          style={styles.card}
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <MaterialIcons name="psychology" size={48} color={Colors.primary} />
          </View>

          <Text style={styles.title}>AI-Powered Gameplay</Text>
          <Text style={styles.body}>
            This app uses artificial intelligence to generate questions and evaluate your guesses. 
            Your personal data is not shared with AI services.
          </Text>
          <Text style={styles.body}>
            Do you want to continue?
          </Text>

          {/* Features list */}
          <View style={styles.featureList}>
            {[
              'Creative questions generated just for you',
              'Smart answer evaluation with explanations',
              'Fermi estimation with logical reasoning',
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          <PrimaryButton
            label="Accept & Continue"
            onPress={onAccept}
            style={styles.acceptBtn}
          />
          <Pressable onPress={onDecline} style={styles.declineBtn} hitSlop={8}>
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.lg,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary + '1A',
    borderWidth: 2,
    borderColor: Colors.primary + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  body: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  featureList: {
    width: '100%',
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  acceptBtn: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  declineBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  declineText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
});
