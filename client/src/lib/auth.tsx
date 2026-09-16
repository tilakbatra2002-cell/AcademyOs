import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, AUTH_EXPIRED_EVENT } from './api';
import type { PortalKey, Role, SessionResponse, SessionUser } from '@/types';

/**
 * Session state.
 *
 * The JWT lives in an httpOnly cookie that JavaScript cannot read, so "are we
 * logged in?" is answered by asking the server (`GET /auth/me`) rather than by
 * inspecting storage. Nothing about the session is persisted client-side.
 */

interface AuthState {
  user: SessionUser | null;
  organization: SessionResponse['organization'];
  subscription: SessionResponse['subscription'];
  loading: boolean;
  login: (portal: PortalKey, email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export const PORTAL_ROLES: Record<PortalKey, Role[]> = {
  owner: ['SAAS_OWNER'],
  admin: ['ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF'],
  teacher: ['TEACHER'],
  student: ['STUDENT'],
  parent: ['PARENT'],
};

export function portalForRole(role: Role): PortalKey {
  if (role === 'SAAS_OWNER') return 'owner';
  if (role === 'TEACHER') return 'teacher';
  if (role === 'STUDENT') return 'student';
  if (role === 'PARENT') return 'parent';
  return 'admin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organization, setOrganization] = useState<SessionResponse['organization']>(null);
  const [subscription, setSubscription] = useState<SessionResponse['subscription']>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const applySession = useCallback((data: SessionResponse | null) => {
    setUser(data?.user ?? null);
    setOrganization(data?.organization ?? null);
    setSubscription(data?.subscription ?? null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionResponse>('/auth/me', undefined, { silent401: true });
      applySession(data);
    } catch {
      applySession(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any 401 from anywhere in the app drops the session so guards can redirect.
  useEffect(() => {
    const onExpired = () => {
      applySession(null);
      queryClient.clear();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [applySession, queryClient]);

  const login = useCallback(
    async (portal: PortalKey, email: string, password: string) => {
      const data = await api.post<SessionResponse>('/auth/login', { email, password, portal });
      applySession(data);
      setLoading(false);
      queryClient.clear();
      if (!data.user) throw new ApiError(500, { code: 'NO_USER', message: 'Login did not return a user' });
      return data.user;
    },
    [applySession, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* logging out locally regardless */
    }
    applySession(null);
    queryClient.clear();
  }, [applySession, queryClient]);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === 'SAAS_OWNER') return true;
      return user.permissions?.includes(permission) ?? false;
    },
    [user],
  );

  const hasRole = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  const value = useMemo(
    () => ({ user, organization, subscription, loading, login, logout, refresh, can, hasRole }),
    [user, organization, subscription, loading, login, logout, refresh, can, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
