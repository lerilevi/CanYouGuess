import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { getOfferings, purchasePackage, restorePurchases } from '@/services/purchasesService';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useAlert } from '@/template';

interface PaywallScreenProps {
  visible: boolean;
  onClose: () => void;
  trigger?: 'category' | 'limit';
}

const BENEFITS = [
  { icon: 'all-inclusive' as const, label: 'Unlimited questions every day' },
  { icon: 'lock-open' as const, label: 'All 7 categories unlocked' },
  { icon: 'block' as const, label: 'Ad-free experience' },
  { icon: 'star' as const, label: 'Keep access forever — no renewals' },
];

export function PaywallScreen({ visible, onClose, trigger = 'category' }: PaywallScreenProps) {
  const { refreshPurchase } = useSubscriptionStatus();
  const { showAlert } = useAlert();
  const [offerings, setOfferings] = useState<unknown[] | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (visible) loadOfferings();
  }, [visible]);

  const loadOfferings = async () => {
    setLoadingOfferings(true);
    try {
      const result = await getOfferings();
      if (result?.current?.availablePackages) {
        setOfferings(result.current.availablePackages);
      } else {
        setOfferings([]);
      }
    } catch {
      setOfferings([]);
    } finally {
      setLoadingOfferings(false);
    }
  };

  const handlePurchase = async (pkg: unknown) => {
    const packageId = (pkg as any).identifier ?? 'unknown';
    setPurchasingId(packageId);
    const result = await purchasePackage(pkg);
    setPurchasingId(null);

    if (result.success) {
      await refreshPurchase();
      showAlert('Full Game Unlocked!', 'You now have lifetime access to all categories and unlimited questions. Enjoy!');
      onClose();
    } else if (result.error !== 'cancelled') {
      showAlert('Purchase Failed', result.error ?? 'Something went wrong. Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      if (result.isSubscribed) {
        await refreshPurchase();
        showAlert('Purchase Restored!', 'Your Full Game access has been restored. Welcome back!');
        onClose();
      } else {
        showAlert('No Purchase Found', 'We could not find a previous "Unlock Full Game" purchase on this account.');
      }
    } else {
      showAlert('Restore Failed', result.error ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent>
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Close button */}
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>

          {/* Hero image */}
          <Image
            source={require('@/assets/images/premium-hero.png')}
            style={styles.hero}
            contentFit="cover"
            transition={200}
          />

          {/* One-time badge */}
          <LinearGradient
            colors={[Colors.secondary, Colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerBadge}
          >
            <MaterialIcons name="bolt" size={16} color={Colors.textInverse} />
            <Text style={styles.headerBadgeText}>ONE-TIME PURCHASE</Text>
          </LinearGradient>

          {/* Headline */}
          <Text style={styles.title}>Unlock Full Game</Text>
          <Text style={styles.subtitle}>
            {trigger === 'limit'
              ? "You have used today's free questions. Get lifetime access and play without limits."
              : 'One purchase. Full access forever.'}
          </Text>

          {/* Benefits */}
          <View style={styles.benefitsCard}>
            {BENEFITS.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <MaterialIcons name={b.icon} size={18} color={Colors.secondary} />
                </View>
                <Text style={styles.benefitText}>{b.label}</Text>
              </View>
            ))}
          </View>

          {/* One-time highlight box */}
          <View style={styles.oneTimeBox}>
            <MaterialIcons name="verified" size={22} color={Colors.primary} />
            <View style={styles.oneTimeTextBlock}>
              <Text style={styles.oneTimeTitle}>Pay once. Own it forever.</Text>
              <Text style={styles.oneTimeDesc}>
                No subscription. No renewal. Your access never expires.
              </Text>
            </View>
          </View>

          {/* Purchase button */}
          {loadingOfferings ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.loadingText}>Loading purchase options...</Text>
            </View>
          ) : offerings && offerings.length > 0 ? (
            <View style={styles.purchaseContainer}>
              {offerings.map((pkg: unknown) => {
                const p = pkg as any;
                const productId = p.identifier ?? '';
                const price = p.product?.priceString ?? '';
                const isPurchasing = purchasingId === productId;

                return (
                  <Pressable
                    key={productId}
                    onPress={() => handlePurchase(pkg)}
                    disabled={purchasingId !== null}
                    style={({ pressed }) => [
                      styles.purchaseCard,
                      { opacity: pressed || purchasingId !== null ? 0.85 : 1 },
                    ]}
                  >
                    <LinearGradient
                      colors={[Colors.primary, Colors.primaryDark ?? Colors.primary]}
                      style={styles.purchaseCardGradient}
                    >
                      {isPurchasing ? (
                        <ActivityIndicator color={Colors.textInverse} size="large" />
                      ) : (
                        <>
                          <Text style={styles.purchasePrice}>{price}</Text>
                          <Text style={styles.purchaseLabel}>Unlock Full Game</Text>
                          <Text style={styles.purchaseOnce}>One-time purchase · Lifetime access</Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.noOfferings}>
              <MaterialIcons name="wifi-off" size={32} color={Colors.textMuted} />
              <Text style={styles.noOfferingsText}>
                Purchase option unavailable.{'\n'}Please check your connection and try again.
              </Text>
              <Pressable onPress={loadOfferings} style={styles.retryBtn} hitSlop={8}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Restore */}
          <Pressable
            onPress={handleRestore}
            disabled={restoring}
            style={styles.restoreBtn}
            hitSlop={8}
          >
            {restoring ? (
              <ActivityIndicator color={Colors.textSecondary} size="small" />
            ) : (
              <Text style={styles.restoreText}>Restore Purchase</Text>
            )}
          </Pressable>

          {/* Legal note */}
          <Text style={styles.legalText}>
            This is a non-consumable one-time in-app purchase. Once bought, Full Game access is yours permanently with no recurring charges.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 56,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hero: {
    width: '100%',
    height: 200,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
    color: Colors.textInverse,
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: FontWeight.black,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  benefitsCard: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontSize: FontSize.base,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  oneTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.primary + '12',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    alignSelf: 'stretch',
    marginHorizontal: Spacing.lg,
  },
  oneTimeTextBlock: {
    flex: 1,
  },
  oneTimeTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  oneTimeDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  loadingBox: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  purchaseContainer: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  purchaseCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  purchaseCardGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    minHeight: 110,
    gap: 4,
  },
  purchasePrice: {
    fontSize: 36,
    fontWeight: FontWeight.black,
    color: Colors.textInverse,
    letterSpacing: -0.5,
  },
  purchaseLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  purchaseOnce: {
    fontSize: FontSize.sm,
    color: Colors.textInverse + 'CC',
    marginTop: 2,
  },
  noOfferings: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  noOfferingsText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  restoreBtn: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
  legalText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.xl,
  },
});
