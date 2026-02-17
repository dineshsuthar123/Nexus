/**
 * Nexus RTP Platform - Auth Hooks
 *
 * Custom hooks for authentication state and session management.
 */

'use client';

import { useSession as useNextAuthSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { getServerSession as getNextAuthServerSession } from 'next-auth';

import { authOptions } from './auth-options';
import type { User } from '@/lib/api/types';

// =============================================================================
// Server-side Session
// =============================================================================

/**
 * Get session on the server side
 */
export async function getServerSession() {
  return getNextAuthServerSession(authOptions);
}

// =============================================================================
// Client-side Hooks
// =============================================================================

/**
 * Extended session hook with additional auth utilities
 */
export function useSession() {
  const session = useNextAuthSession();

  return {
    ...session,
    isAuthenticated: session.status === 'authenticated',
    isLoading: session.status === 'loading',
    isUnauthenticated: session.status === 'unauthenticated',
    user: session.data?.user as User | undefined,
    accessToken: session.data?.accessToken,
    hasError: !!session.data?.error,
  };
}

/**
 * Main auth hook with all authentication operations
 */
export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status, update } = useNextAuthSession();

  const user = session?.user as User | undefined;
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';

  /**
   * Login with email and password
   */
  const login = useCallback(
    async (email: string, password: string, mfaCode?: string) => {
      const result = await signIn('credentials', {
        email,
        password,
        mfaCode,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'MFA_REQUIRED') {
          return { success: false, mfaRequired: true, error: null };
        }
        return { success: false, mfaRequired: false, error: result.error };
      }

      return { success: true, mfaRequired: false, error: null };
    },
    []
  );

  /**
   * Logout and redirect to login page
   */
  const logout = useCallback(
    async (callbackUrl = '/auth/login') => {
      await signOut({ redirect: true, callbackUrl });
    },
    []
  );

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (role: string | string[]) => {
      if (!user) return false;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(user.role);
    },
    [user]
  );

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback(
    (permission: string | string[]) => {
      if (!user) return false;
      const permissions = Array.isArray(permission) ? permission : [permission];
      return permissions.some((p) => user.permissions?.includes(p));
    },
    [user]
  );

  /**
   * Check if user has all specified permissions
   */
  const hasAllPermissions = useCallback(
    (permissions: string[]) => {
      if (!user) return false;
      return permissions.every((p) => user.permissions?.includes(p));
    },
    [user]
  );

  /**
   * Refresh the session
   */
  const refreshSession = useCallback(async () => {
    await update();
  }, [update]);

  return {
    user,
    session,
    status,
    isAuthenticated,
    isLoading,
    isUnauthenticated: status === 'unauthenticated',
    accessToken: session?.accessToken,
    hasError: !!session?.error,
    error: session?.error,
    login,
    logout,
    hasRole,
    hasPermission,
    hasAllPermissions,
    refreshSession,
  };
}

/**
 * Hook that requires authentication
 * Redirects to login if not authenticated
 */
export function useRequireAuth(options?: {
  redirectTo?: string;
  requiredRole?: string | string[];
  requiredPermission?: string | string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();

  const redirectTo = options?.redirectTo || '/auth/login';

  useEffect(() => {
    if (isLoading) return;

    // Not authenticated - redirect to login
    if (!isAuthenticated) {
      const callbackUrl = encodeURIComponent(pathname);
      router.push(`${redirectTo}?callbackUrl=${callbackUrl}`);
      return;
    }

    // Check role requirement
    if (options?.requiredRole && !hasRole(options.requiredRole)) {
      router.push('/403');
      return;
    }

    // Check permission requirement
    if (options?.requiredPermission && !hasPermission(options.requiredPermission)) {
      router.push('/403');
      return;
    }
  }, [
    isAuthenticated,
    isLoading,
    pathname,
    router,
    redirectTo,
    options?.requiredRole,
    options?.requiredPermission,
    hasRole,
    hasPermission,
  ]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isAuthorized:
      isAuthenticated &&
      (!options?.requiredRole || hasRole(options.requiredRole)) &&
      (!options?.requiredPermission || hasPermission(options.requiredPermission)),
  };
}
