import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { loginPurchasesUser } from '@/services/purchasesService';

type Mode = 'login' | 'register' | 'otp' | 'forgot' | 'forgot_sent';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sendOTP, verifyOTPAndLogin, signInWithPassword } = useAuth();
  const { showAlert } = useAlert();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error, user } = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (error) {
      showAlert('Login Failed', error);
      return;
    }
    if (user) {
      await loginPurchasesUser(user.id);
      router.replace('/(tabs)');
    }
  };

  const handleRegister = async () => {
    if (!email || !username || !password || !confirmPassword) {
      showAlert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      showAlert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error } = await sendOTP(email.trim());
    setLoading(false);
    if (error) {
      showAlert('Error', error);
      return;
    }
    setMode('otp');
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      showAlert('Missing Email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
    setLoading(false);
    if (error) {
      showAlert('Error', error.message);
      return;
    }
    setMode('forgot_sent');
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 4) {
      showAlert('Invalid Code', 'Please enter the 4-digit verification code.');
      return;
    }
    setLoading(true);
    const { error, user } = await verifyOTPAndLogin(email.trim(), otp, {
      password,
      data: { username: username.trim() },
    });
    setLoading(false);
    if (error) {
      showAlert('Verification Failed', error);
      return;
    }
    if (user) {
      await loginPurchasesUser(user.id);
      // New user — show onboarding slides before home
      router.replace('/onboarding');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back / close */}
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={24} color={Colors.textSecondary} />
          </Pressable>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              contentFit="contain"
              transition={200}
            />
            <Text style={styles.appName}>Can You Guess?</Text>
          </View>

          {/* Card */}
          <LinearGradient
            colors={[Colors.surface2, Colors.surface]}
            style={styles.card}
          >
            {/* Mode tabs */}
            {mode === 'login' || mode === 'register' ? (
              <View style={styles.modeTabs}>
                {(['login', 'register'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.modeTab, mode === m && styles.modeTabActive]}
                  >
                    <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
                      {m === 'login' ? 'Log In' : 'Sign Up'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : mode === 'otp' ? (
              <View style={styles.otpHeader}>
                <MaterialIcons name="mark-email-unread" size={36} color={Colors.primary} />
                <Text style={styles.otpTitle}>Check Your Email</Text>
                <Text style={styles.otpSubtitle}>
                  We sent a 4-digit code to{'\n'}
                  <Text style={styles.otpEmail}>{email}</Text>
                </Text>
              </View>
            ) : mode === 'forgot' ? (
              <View style={styles.otpHeader}>
                <View style={styles.forgotIconWrap}>
                  <MaterialIcons name="lock-reset" size={32} color={Colors.primary} />
                </View>
                <Text style={styles.otpTitle}>Reset Password</Text>
                <Text style={styles.otpSubtitle}>
                  Enter your email and we will send you a link to reset your password.
                </Text>
              </View>
            ) : (
              <View style={styles.otpHeader}>
                <View style={[styles.forgotIconWrap, { backgroundColor: Colors.successBg }]}>
                  <MaterialIcons name="mark-email-read" size={32} color={Colors.success} />
                </View>
                <Text style={styles.otpTitle}>Email Sent!</Text>
                <Text style={styles.otpSubtitle}>
                  Check your inbox at{'\n'}
                  <Text style={styles.otpEmail}>{forgotEmail}</Text>{'\n\n'}
                  Click the link in the email to set a new password, then come back here to log in.
                </Text>
              </View>
            )}

            {/* Fields */}
            {mode === 'forgot_sent' ? (
              <PrimaryButton
                label="Back to Log In"
                onPress={() => { setMode('login'); setForgotEmail(''); }}
                style={styles.actionBtn}
              />
            ) : mode === 'forgot' ? (
              <>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
                <PrimaryButton
                  label="Send Reset Email"
                  onPress={handleForgotPassword}
                  loading={loading}
                  style={styles.actionBtn}
                />
                <Pressable onPress={() => setMode('login')} hitSlop={8} style={styles.resendBtn}>
                  <Text style={styles.resendText}>Back to Log In</Text>
                </Pressable>
              </>
            ) : mode === 'otp' ? (
              <>
                <Text style={styles.label}>Verification Code</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="dialpad" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="4-digit code"
                    placeholderTextColor={Colors.textMuted}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                  />
                </View>
                <PrimaryButton
                  label="Verify & Create Account"
                  onPress={handleVerifyOTP}
                  loading={loading}
                  style={styles.actionBtn}
                />
                <Pressable onPress={() => setMode('register')} hitSlop={8} style={styles.resendBtn}>
                  <Text style={styles.resendText}>Back to Sign Up</Text>
                </Pressable>
              </>
            ) : mode === 'register' ? (
              <>
                <Text style={styles.label}>Username</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="person" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Your display name"
                    placeholderTextColor={Colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>

                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock-outline" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Repeat your password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <PrimaryButton
                  label="Create Account"
                  onPress={handleRegister}
                  loading={loading}
                  style={styles.actionBtn}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Your password"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>

                <PrimaryButton
                  label="Log In"
                  onPress={handleLogin}
                  loading={loading}
                  style={styles.actionBtn}
                />
                <Pressable
                  onPress={() => { setForgotEmail(email); setMode('forgot'); }}
                  hitSlop={8}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>
              </>
            )}
          </LinearGradient>


        </ScrollView>
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
  scroll: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: Colors.surface2,
  },
  modeTabText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.text,
    fontWeight: FontWeight.bold,
  },
  otpHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  otpTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  otpSubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  otpEmail: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.text,
    includeFontPadding: false,
  },
  actionBtn: {
    marginTop: Spacing.lg,
    width: '100%',
  },
  resendBtn: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  resendText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textDecorationLine: 'underline',
  },
  forgotBtn: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  forgotText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  forgotIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

});
