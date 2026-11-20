import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, apiFetch, setSessionToken } from '../lib/api.ts';
import type { CategoryItem, PortalSettings, PortalUser } from '../shared/types.ts';

interface PublicContextResponse {
  settings: PortalSettings;
  categories: CategoryItem[];
  demoPasswordActive: boolean;
}

interface MeResponse {
  user: PortalUser;
  settings: PortalSettings;
  categories: CategoryItem[];
}

interface LoginResponse {
  token: string;
  user: PortalUser;
}

interface AuthContextValue {
  user: PortalUser | null;
  settings: PortalSettings;
  categories: CategoryItem[];
  demoPasswordActive: boolean;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  login: (identifier: string, password: string) => Promise<PortalUser | null>;
  logout: () => Promise<void>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<PortalUser>;
  refreshPublicContext: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearAuthError: () => void;
}

const DEFAULT_SETTINGS: PortalSettings = {
  id: 1,
  companyName: 'HostGraber',
  companyWebsite: 'https://hostgraber.com/',
  logoUrl: null,
  logoShowCompanyName: true,
  currencyCode: 'INR',
  currencySymbol: '₹',
  defaultTaxRate: 18,
  defaultTaxDisplay: 'before_tax',
  defaultBillingDurations: [
    'monthly',
    'quarterly',
    'semiannually',
    'annually',
    'biennially',
    'triennially',
  ],
  updatedBy: null,
  updatedAt: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [demoPasswordActive, setDemoPasswordActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshPublicContext = useCallback(async () => {
    try {
      const ctx = await apiFetch<PublicContextResponse>('/api/public/context');
      setSettings(ctx.settings);
      setCategories(ctx.categories);
      setDemoPasswordActive(Boolean(ctx.demoPasswordActive));
    } catch (err) {
      console.error('Failed to load public portal context:', err);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const sessionRes = await apiFetch<{
        user: PortalUser | null;
        settings?: PortalSettings;
        categories?: CategoryItem[];
      }>('/api/auth/session');
      if (sessionRes.user) {
        setUser(sessionRes.user);
        if (sessionRes.settings) setSettings(sessionRes.settings);
        if (sessionRes.categories) setCategories(sessionRes.categories);
        setAuthError(null);
      } else {
        setSessionToken(null);
        setUser(null);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setSessionToken(null);
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await Promise.all([refreshPublicContext(), refreshSession()]);
      if (active) {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshPublicContext, refreshSession]);

  const login = async (
    identifier: string,
    password: string
  ): Promise<PortalUser | null> => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setSessionToken(res.token);
      setUser(res.user);
      await refreshPublicContext();
      return res.user;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid username or password.';
      setAuthError(message);
      return null;
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    setAuthError(null);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    setSessionToken(null);
    setUser(null);
    await refreshPublicContext();
  };

  const changeOwnPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<PortalUser> => {
    const res = await apiFetch<{ user: PortalUser }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setUser(res.user);
    await refreshPublicContext();
    return res.user;
  };

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        categories,
        demoPasswordActive,
        loading,
        signingIn,
        authError,
        login,
        logout,
        changeOwnPassword,
        refreshPublicContext,
        refreshSession,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
