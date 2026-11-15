'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  AuthUser,
  LoginDto,
  RegisterDto,
  RegisterResponse,
} from '../services/auth-contract';
import { loginApi, registerApi } from '../services/auth';
import {
  AUTH_SESSION_CLEARED_EVENT,
  AUTH_STORAGE_KEY,
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from '../utils/auth';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  login: (dto: LoginDto) => Promise<AuthUser>;
  register: (dto: RegisterDto) => Promise<RegisterResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // 1. Chỉ nạp phiên đăng nhập từ localStorage sau khi client mount để tránh hydration error
  useEffect(() => {
    let isMounted = true;

    Promise.resolve().then(() => {
      if (isMounted) {
        const session = loadAuthSession();
        if (session) {
          setUser(session.user);
          setToken(session.token);
        }
        setIsHydrated(true);
      }
    });

    // 2. Lắng nghe storage event để đồng bộ tức thì giữa các tab với khóa brewlite_auth_v2
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY && isMounted) {
        const updated = loadAuthSession();
        if (updated) {
          setUser(updated.user);
          setToken(updated.token);
        } else {
          setUser(null);
          setToken(null);
        }
      }
    };

    const handleSessionCleared = () => {
      if (isMounted) {
        setUser(null);
        setToken(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    };
  }, []);

  const login = useCallback(async (dto: LoginDto): Promise<AuthUser> => {
    const res = await loginApi(dto);
    saveAuthSession({
      token: res.accessToken,
      user: res.user,
    });
    setUser(res.user);
    setToken(res.accessToken);
    return res.user;
  }, []);

  const register = useCallback(async (dto: RegisterDto): Promise<RegisterResponse> => {
    return registerApi(dto);
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setToken(null);
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    isHydrated,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  token: null,
  isAuthenticated: false,
  isHydrated: true,
  login: async () => ({ id: '', email: '', displayName: '', role: 'CUSTOMER' }),
  register: async () => ({ id: '', email: '', displayName: '', role: 'CUSTOMER' }),
  logout: () => {},
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}
