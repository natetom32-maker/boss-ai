import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Boss AI Avatar - YOUR face (Nate)
const BOSS_AVATAR_IMAGE = 'https://customer-assets.emergentagent.com/job_2aa2b813-f5fe-4ade-a9d9-bc418df86344/artifacts/maffvqbd_nate%20without%20background.png';

export default function Index() {
  const { isAuthenticated, isLoading, login, register, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Form state
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    setErrorMessage('');
    
    // Validation
    if (!email.trim()) {
      setErrorMessage('Please enter your email');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Please enter your password');
      return;
    }
    if (!isLoginMode && !name.trim()) {
      setErrorMessage('Please enter your name');
      return;
    }
    if (!isLoginMode && password.length < 4) {
      setErrorMessage('Password must be at least 4 characters');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (isLoginMode) {
        const result = await login(email, password, rememberMe);
        if (!result.success) {
          setErrorMessage(result.error || 'Login failed');
        }
      } else {
        const result = await register(email, password, name);
        if (!result.success) {
          setErrorMessage(result.error || 'Registration failed');
        }
      }
    } catch (error: any) {
      setErrorMessage('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <View style={styles.bossAvatarLoading}>
            <Image
              source={{ uri: BOSS_AVATAR_IMAGE }}
              style={styles.avatarImage}
            />
          </View>
          <ActivityIndicator size="large" color="#6366F1" style={styles.loader} />
          <Text style={styles.loadingText}>Initializing Boss AI...</Text>
        </View>
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.bossAvatarLarge}>
            <Image
              source={{ uri: BOSS_AVATAR_IMAGE }}
              style={styles.avatarImage}
            />
          </View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name}</Text>
        </View>

        <View style={styles.content}>
          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => router.push('/boss')}
          >
            <Ionicons name="flash" size={28} color="#FFF" />
            <View style={styles.buttonContent}>
              <Text style={styles.buttonTitle}>Talk to Boss</Text>
              <Text style={styles.buttonSubtitle}>AI Operating Layer</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#6366F1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/memory')}
          >
            <Ionicons name="server" size={24} color="#A855F7" />
            <View style={styles.buttonContent}>
              <Text style={styles.secondaryButtonTitle}>Memory Engine</Text>
              <Text style={styles.buttonSubtitle}>View & manage memory</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/projects')}
          >
            <Ionicons name="folder" size={24} color="#22C55E" />
            <View style={styles.buttonContent}>
              <Text style={styles.secondaryButtonTitle}>Projects</Text>
              <Text style={styles.buttonSubtitle}>Scoped memory & context</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/decisions')}
          >
            <Ionicons name="checkmark-done" size={24} color="#F59E0B" />
            <View style={styles.buttonContent}>
              <Text style={styles.secondaryButtonTitle}>Decisions</Text>
              <Text style={styles.buttonSubtitle}>History of choices made</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Boss AI - Operating Layer, Not Chatbot</Text>
          <Text style={styles.footerSubtext}>Remembers decisions, not conversations</Text>
        </View>
      </View>
    );
  }

  // Login/Register screen
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.bossAvatarHero}>
            <Video
              source={{ uri: BOSS_AVATAR_VIDEO }}
              style={styles.avatarVideo}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isLooping={true}
              isMuted={true}
            />
          </View>
          
          <Text style={styles.title}>Boss AI</Text>
          <Text style={styles.subtitle}>Operating Layer</Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="flash" size={18} color="#6366F1" />
              <Text style={styles.featureText}>Autopilot by default</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="server" size={18} color="#A855F7" />
              <Text style={styles.featureText}>Structured memory</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={18} color="#22C55E" />
              <Text style={styles.featureText}>Checkpoints for safety</Text>
            </View>
          </View>
        </View>

        {/* Auth Form */}
        <View style={styles.authSection}>
          {/* Toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, isLoginMode && styles.toggleButtonActive]}
              onPress={() => {
                setIsLoginMode(true);
                setErrorMessage('');
              }}
            >
              <Text style={[styles.toggleText, isLoginMode && styles.toggleTextActive]}>
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, !isLoginMode && styles.toggleButtonActive]}
              onPress={() => {
                setIsLoginMode(false);
                setErrorMessage('');
              }}
            >
              <Text style={[styles.toggleText, !isLoginMode && styles.toggleTextActive]}>
                Register
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Name Field (Register only) */}
          {!isLoginMode && (
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Email Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity 
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Ionicons 
                name={showPassword ? "eye-off-outline" : "eye-outline"} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>

          {/* Remember Me (Login only) */}
          {isLoginMode && (
            <TouchableOpacity 
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <Text style={styles.rememberMeText}>Stay logged in</Text>
            </TouchableOpacity>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>
                  {isLoginMode ? 'Login' : 'Create Account'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Boss remembers decisions, not conversations
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bossAvatarLoading: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  loader: {
    marginTop: 24,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  bossAvatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  avatarVideo: {
    width: '100%',
    height: '100%',
  },
  avatarVideoSmall: {
    width: '100%',
    height: '100%',
  },
  welcomeText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  userName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  buttonContent: {
    flex: 1,
    marginLeft: 16,
  },
  buttonTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonSubtitle: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 40,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerSubtext: {
    color: '#444',
    fontSize: 12,
    marginTop: 4,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 32,
  },
  bossAvatarHero: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    borderWidth: 3,
    borderColor: '#6366F1',
    marginBottom: 20,
  },
  title: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  featureList: {
    marginTop: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    color: '#AAA',
    fontSize: 14,
    marginLeft: 10,
  },
  authSection: {
    paddingBottom: 40,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleButtonActive: {
    backgroundColor: '#6366F1',
  },
  toggleText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFF',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444420',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    paddingVertical: 14,
  },
  eyeButton: {
    padding: 8,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  rememberMeText: {
    color: '#AAA',
    fontSize: 14,
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
});
