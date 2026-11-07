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

    // 2. Lắng nghe storage event để đồng bộ tức thì giữa các tab (tab A logout thì tab B cũng logout)
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

    window.addEventListener('storage', handleStorageChange);
    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = useCallback(async (dto: LoginDto): Promise<AuthUser> => {
    const res = await loginApi(dto);
    saveAuthSession({
      token: res.access_token,
      user: res.user,
    });
    setUser(res.user);
    setToken(res.access_token);
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
  login: async () => {
    throw new Error('AuthProvider is missing');
  },
  register: async () => {
    throw new Error('AuthProvider is missing');
  },
  logout: () => {},
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    return defaultAuthContext;
  }
  return context;
}

