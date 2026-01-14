import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from '../services/api';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
  auth_provider?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
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

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/login', {
        email: email.toLowerCase().trim(),
        password,
        remember_me: rememberMe
      });
      
      const { user: userData, session_token } = response.data;
      
      await AsyncStorage.setItem('session_token', session_token);
      if (rememberMe) {
        await AsyncStorage.setItem('remember_me', 'true');
      }
      
      setUser(userData);
      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.detail || 'Login failed. Please try again.';
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/register', {
        email: email.toLowerCase().trim(),
        password,
        name: name.trim()
      });
      
      const { user: userData, session_token } = response.data;
      
      await AsyncStorage.setItem('session_token', session_token);
      setUser(userData);
      return { success: true };
    } catch (error: any) {
      console.error('Register error:', error);
      const errorMessage = error.response?.data?.detail || 'Registration failed. Please try again.';
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
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
      await AsyncStorage.removeItem('remember_me');
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
