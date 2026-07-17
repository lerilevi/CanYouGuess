import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert } from '@/template';
import { useGame } from '@/hooks/useGame';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { BadgeCard } from '@/components/ui/BadgeCard';
import { PaywallScreen } from '@/components/feature/PaywallScreen';
import {
  getOrCreateUserStats,
  updateUsername,
  updateEmail,
  updatePassword,
  deleteUserAccount,
  UserStats,
} from '@/services/profileService';
import { logoutPurchasesUser, restorePurchases } from '@/services/purchasesService';
import { BADGES } from '@/constants/config';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

type EditField = 'username' | 'email' | 'password' | null;

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { user, logout, refreshSession } = useAuth();
  const { showAlert } = useAlert();
  const { userBadges, loadUserData } = useGame();
  const { isPaid, refreshPurchase } = useSubscriptionStatus();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Edit profile state
  const [editField, setEditField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState('');
  const [editConfirm, setEditConfirm] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setLoadingStats(true);
      getOrCreateUserStats(user.id)
        .then(setStats)
        .finally(() => setLoadingStats(false));
    }
  }, [user]);

  const handleLogout = async () => {
    showAlert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logoutPurchasesUser();
          const { error } = await logout();
          setLoggingOut(false);
          if (error) showAlert('Error', error);
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    showAlert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            showAlert(
              'Are You Sure?',
              'Your scores, streaks, badges, and leaderboard entries will be permanently removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await logoutPurchasesUser();
                    const { error } = await deleteUserAccount();
                    if (error) {
                      showAlert('Delete Error', error);
                      return;
                    }
                    // Session is already cleared server-side; call logout to clean up locally.
                    await logout();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleRestorePurchase = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.success) {
      if (result.isSubscribed) {
        await refreshPurchase();
        showAlert('Purchase Restored!', 'Your Full Game access has been restored.');
      } else {
        showAlert('No Purchase Found', 'We could not find a previous "Unlock Full Game" purchase on this account.');
      }
    } else {
      showAlert('Restore Failed', result.error ?? 'Please try again.');
    }
  };

  const openEditField = (field: EditField) => {
    setEditField(field);
    setEditValue(
      field === 'username' ? (user?.username ?? '') :
      field === 'email' ? (user?.email ?? '') : ''
    );
    setEditConfirm('');
  };

  const handleSaveEdit = async () => {
    if (!user || !editField) return;
    if (!editValue.trim()) {
      showAlert('Error', 'Please enter a value.');
      return;
    }

    if (editField === 'password') {
      if (editValue.length < 6) {
        showAlert('Error', 'Password must be at least 6 characters.');
        return;
      }
      if (editValue !== editConfirm) {
        showAlert('Error', 'Passwords do not match.');
        return;
      }
    }

    setEditLoading(true);
    let result: { error: string | null } = { error: null };

    if (editField === 'username') {
      result = await updateUsername(user.id, editValue.trim());
    } else if (editField === 'email') {
      result = await updateEmail(editValue.trim());
    } else if (editField === 'password') {
      result = await updatePassword(editValue);
    }

    setEditLoading(false);

    if (result.error) {
      showAlert('Error', result.error);
    } else {
      showAlert(
        'Updated!',
        editField === 'email'
          ? 'A confirmation email has been sent to verify your new email address.'
          : `Your ${editField} has been updated.`
      );
      setEditField(null);
      await refreshSession();
      loadUserData();
    }
  };

  const displayName = user?.username ?? user?.email?.split('@')[0] ?? 'Player';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Profile</Text>

          {/* Profile card */}
          <LinearGradient colors={[Colors.surface2, Colors.surface]} style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDark ?? Colors.primary]} style={styles.avatar}>
                <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
              {isPaid ? (
                <View style={styles.paidBadgeOnAvatar}>
                  <MaterialIcons name="star" size={12} color={Colors.secondary} />
                </View>
              ) : null}
            </View>
            <Text style={styles.displayName}>{displayName}</Text>
            <Text style={styles.email}>{user?.email}</Text>

            {/* Access status pill */}
            {isPaid ? (
              <View style={styles.accessPillPaid}>
                <MaterialIcons name="star" size={12} color={Colors.secondary} />
                <Text style={styles.accessPillPaidText}>Full Game Unlocked</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowPaywall(true)}
                style={({ pressed }) => [styles.accessPillFree, { opacity: pressed ? 0.75 : 1 }]}
              >
                <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                <Text style={styles.accessPillFreeText}>Free User · Unlock Full Game</Text>
                <MaterialIcons name="chevron-right" size={12} color={Colors.textMuted} />
              </Pressable>
            )}

            {/* Edit profile buttons */}
            <View style={styles.editBtnsRow}>
              {[
                { field: 'username' as EditField, label: 'Username', icon: 'edit' as const },
                { field: 'email' as EditField, label: 'Email', icon: 'email' as const },
                { field: 'password' as EditField, label: 'Password', icon: 'lock' as const },
              ].map((btn) => (
                <Pressable
                  key={btn.field}
                  onPress={() => openEditField(btn.field)}
                  style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <MaterialIcons name={btn.icon} size={14} color={Colors.primary} />
                  <Text style={styles.editBtnText}>{btn.label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>

          {/* Inline edit form */}
          {editField ? (
            <View style={styles.editForm}>
              <Text style={styles.editFormTitle}>
                Change {editField.charAt(0).toUpperCase() + editField.slice(1)}
              </Text>
              <TextInput
                style={styles.editInput}
                placeholder={
                  editField === 'username' ? 'New username' :
                  editField === 'email' ? 'New email address' :
                  'New password (min. 6 chars)'
                }
                placeholderTextColor={Colors.textMuted}
                value={editValue}
                onChangeText={setEditValue}
                autoCapitalize="none"
                keyboardType={editField === 'email' ? 'email-address' : 'default'}
                secureTextEntry={editField === 'password'}
                autoCorrect={false}
                accessibilityLabel={`New ${editField}`}
              />
              {editField === 'password' ? (
                <TextInput
                  style={styles.editInput}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.textMuted}
                  value={editConfirm}
                  onChangeText={setEditConfirm}
                  secureTextEntry
                  autoCorrect={false}
                  accessibilityLabel="Confirm password"
                />
              ) : null}
              <View style={styles.editFormBtns}>
                <Pressable
                  onPress={() => setEditField(null)}
                  style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveEdit}
                  disabled={editLoading}
                  style={({ pressed }) => [styles.saveBtn, { opacity: pressed || editLoading ? 0.7 : 1 }]}
                >
                  {editLoading ? (
                    <ActivityIndicator size="small" color={Colors.textInverse} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Stats */}
          {loadingStats ? (
            <ActivityIndicator color={Colors.primary} />
          ) : stats ? (
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>Your Stats</Text>
              <View style={styles.statsGrid}>
                {[
                  { label: 'Total Score', value: (stats.total_score ?? 0).toLocaleString(), icon: 'star' as const, color: Colors.secondary },
                  { label: 'Questions', value: (stats.total_questions ?? 0).toLocaleString(), icon: 'quiz' as const, color: Colors.accent },
                  { label: 'Current Streak', value: `${stats.current_streak ?? 0}d`, icon: 'local-fire-department' as const, color: Colors.error },
                  { label: 'Best Streak', value: `${stats.longest_streak ?? 0}d`, icon: 'emoji-events' as const, color: Colors.primary },
                ].map((s, i) => (
                  <View key={i} style={styles.statCard}>
                    <MaterialIcons name={s.icon} size={20} color={s.color} />
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Badges */}
          <Text style={styles.sectionTitle}>Badges</Text>
          <View style={styles.badgesGrid}>
            {BADGES.map((badge) => (
              <BadgeCard
                key={badge.id}
                {...badge}
                earned={userBadges.some((b) => b.badge_id === badge.id)}
              />
            ))}
          </View>

          {/* Settings */}
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.settingsCard}>
            <Pressable
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="privacy-tip" size={20} color={Colors.textSecondary} />
              <Text style={styles.settingsLabel}>Privacy Policy</Text>
              <MaterialIcons name="open-in-new" size={16} color={Colors.textMuted} />
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable
              onPress={() => Linking.openURL(TERMS_URL)}
              style={({ pressed }) => [styles.settingsRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MaterialIcons name="description" size={20} color={Colors.textSecondary} />
              <Text style={styles.settingsLabel}>Terms of Use</Text>
              <MaterialIcons name="open-in-new" size={16} color={Colors.textMuted} />
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable
              onPress={handleRestorePurchase}
              disabled={restoring}
              style={({ pressed }) => [styles.settingsRow, { opacity: pressed || restoring ? 0.7 : 1 }]}
            >
              <MaterialIcons name="restore" size={20} color={Colors.textSecondary} />
              <Text style={styles.settingsLabel}>Restore Purchase</Text>
              {restoring ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              )}
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable
              onPress={handleLogout}
              disabled={loggingOut}
              style={({ pressed }) => [styles.settingsRow, { opacity: pressed || loggingOut ? 0.7 : 1 }]}
            >
              <MaterialIcons name="logout" size={20} color={Colors.error} />
              <Text style={[styles.settingsLabel, { color: Colors.error }]}>Log Out</Text>
              {loggingOut ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              )}
            </Pressable>
          </View>

          <Pressable
            onPress={handleDeleteAccount}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
            hitSlop={4}
          >
            <MaterialIcons name="delete-forever" size={18} color={Colors.error} />
            <Text style={styles.deleteBtnText}>Delete My Account</Text>
          </Pressable>

          <Text style={styles.version}>Can You Guess? v1.0.0</Text>
        </ScrollView>

        <PaywallScreen
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          trigger="category"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  // Profile card
  profileCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadow.md,
  },
  avatarContainer: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidBadgeOnAvatar: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  displayName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  email: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  accessPillPaid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary + '22',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.secondary + '55',
    marginTop: 4,
  },
  accessPillPaidText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: FontWeight.bold,
  },
  accessPillFree: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  accessPillFreeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  editBtnsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '1A',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  editBtnText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  // Edit form
  editForm: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  editFormTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  editInput: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.base,
    color: Colors.text,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  editFormBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.base,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: Colors.textInverse,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
  },
  // Stats
  statsSection: { gap: Spacing.md },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'space-between',
  },
  // Settings
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 16,
    gap: Spacing.md,
  },
  settingsLabel: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.text,
    fontWeight: FontWeight.medium,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.error + '44',
    backgroundColor: Colors.error + '0D',
  },
  deleteBtnText: {
    fontSize: FontSize.base,
    color: Colors.error,
    fontWeight: FontWeight.semibold,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: -Spacing.sm,
  },
});
