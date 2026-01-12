import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function Index() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <View style={styles.bossAvatar}>
            <Ionicons name="hardware-chip" size={60} color="#6366F1" />
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
          <View style={styles.bossAvatar}>
            <Ionicons name="hardware-chip" size={40} color="#6366F1" />
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

  // Login screen
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.heroSection}>
        <View style={styles.bossAvatarLarge}>
          <Ionicons name="hardware-chip" size={80} color="#6366F1" />
          <View style={styles.avatarGlow} />
        </View>
        
        <Text style={styles.title}>Boss AI</Text>
        <Text style={styles.subtitle}>Operating Layer</Text>
        
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={20} color="#6366F1" />
            <Text style={styles.featureText}>Autopilot by default</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="server" size={20} color="#A855F7" />
            <Text style={styles.featureText}>Structured memory</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={20} color="#22C55E" />
            <Text style={styles.featureText}>Checkpoints for safety</Text>
          </View>
        </View>
      </View>

      <View style={styles.loginSection}>
        <TouchableOpacity style={styles.loginButton} onPress={login}>
          <Image
            source={{ uri: 'https://www.google.com/favicon.ico' }}
            style={styles.googleIcon}
          />
          <Text style={styles.loginButtonText}>Continue with Google</Text>
        </TouchableOpacity>
        
        <Text style={styles.disclaimer}>
          Boss remembers decisions, not conversations
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  bossAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  bossAvatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#6366F1',
    marginBottom: 24,
    position: 'relative',
  },
  avatarGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#6366F1',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 4,
  },
  featureList: {
    marginTop: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    color: '#AAA',
    fontSize: 16,
    marginLeft: 12,
  },
  loginSection: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  loginButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
});
