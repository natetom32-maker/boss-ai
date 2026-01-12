import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { api } from '../services/api';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getRedirectUrl = () => {
    if (Platform.OS === 'web') {
      return window.location.origin + '/';
    }
    return Linking.createURL('/');
  };

  const extractSessionId = (url: string): string | null => {
    try {
      // Check hash first
      const hashMatch = url.match(/#session_id=([^&]+)/);
      if (hashMatch) return hashMatch[1];

      // Check query params
      const queryMatch = url.match(/[?&]session_id=([^&]+)/);
      if (queryMatch) return queryMatch[1];

      return null;
    } catch {
      return null;
    }
  };

  const processSessionId = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/session', { session_id: sessionId });
      const { user: userData, session_token } = response.data;
      
      await AsyncStorage.setItem('session_token', session_token);
      setUser(userData);
      
      // Clear URL hash on web
      if (Platform.OS === 'web' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (error) {
      console.error('Error processing session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem('session_token');
      
      if (!token) {
        setUser(null);
        return;
      }

      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setUser(response.data);
    } catch (error) {
      console.error('Auth check failed:', error);
      await AsyncStorage.removeItem('session_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    try {
      const redirectUrl = getRedirectUrl();
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          const sessionId = extractSessionId(result.url);
          if (sessionId) {
            await processSessionId(sessionId);
          }
        }
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        await api.post('/auth/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.removeItem('session_token');
      setUser(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Check for session_id in URL (web) or initial URL (mobile)
      if (Platform.OS === 'web') {
        const hash = window.location.hash;
        const sessionId = extractSessionId(window.location.href);
        if (sessionId) {
          await processSessionId(sessionId);
          return;
        }
      } else {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const sessionId = extractSessionId(initialUrl);
          if (sessionId) {
            await processSessionId(sessionId);
            return;
          }
        }
      }

      // Check existing auth
      await checkAuth();
    };

    init();

    // Listen for URL changes (mobile)
    if (Platform.OS !== 'web') {
      const subscription = Linking.addEventListener('url', async (event) => {
        const sessionId = extractSessionId(event.url);
        if (sessionId) {
          await processSessionId(sessionId);
        }
      });

      return () => subscription.remove();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
