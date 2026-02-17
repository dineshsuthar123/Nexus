/**
 * Nexus RTP Platform - Auth Guards
 * 
 * Higher-order components and wrappers for protecting routes
 * based on authentication status, roles, and permissions.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode, type ComponentType } from 'react';

import { useAuth } from './auth-hooks';

// =============================================================================
// Types
// =============================================================================

export interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

export interface ProtectedRouteProps extends AuthGuardProps {
  requiredRole?: string | string[];
  requiredPermission?: string | string[];
}

// =============================================================================
// Loading Fallback
// =============================================================================

function DefaultLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// =============================================================================
// Auth Guard Components
// =============================================================================

/**
 * Requires authentication to access children
 */
export function RequireAuth({
  children,
  fallback = <DefaultLoadingFallback />,
  redirectTo = '/auth/login',
}: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Requires a specific role to access children
 */
export function RequireRole({
  children,
  fallback = <DefaultLoadingFallback />,
  redirectTo = '/403',
  requiredRole,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (requiredRole && !hasRole(requiredRole)) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, requiredRole, hasRole, redirectTo, router]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!isAuthenticated || (requiredRole && !hasRole(requiredRole))) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Requires a specific permission to access children
 */
export function RequirePermission({
  children,
  fallback = <DefaultLoadingFallback />,
  redirectTo = '/403',
  requiredPermission,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasPermission } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (requiredPermission && !hasPermission(requiredPermission)) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, requiredPermission, hasPermission, redirectTo, router]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!isAuthenticated || (requiredPermission && !hasPermission(requiredPermission))) {
    return null;
  }

  return <>{children}</>;
}

// =============================================================================
// Higher-Order Components
// =============================================================================

/**
 * HOC to wrap a component with authentication requirement
 */
export function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  options?: {
    redirectTo?: string;
    LoadingComponent?: ComponentType;
  }
) {
  const LoadingComponent = options?.LoadingComponent || DefaultLoadingFallback;

  return function AuthenticatedComponent(props: P) {
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push(options?.redirectTo || '/auth/login');
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return <LoadingComponent />;
    }

    if (!isAuthenticated) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}

/**
 * HOC to wrap a component with role requirement
 */
export function withRole<P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredRole: string | string[],
  options?: {
    redirectTo?: string;
    LoadingComponent?: ComponentType;
  }
) {
  const LoadingComponent = options?.LoadingComponent || DefaultLoadingFallback;

  return function RoleProtectedComponent(props: P) {
    const router = useRouter();
    const { isAuthenticated, isLoading, hasRole } = useAuth();

    useEffect(() => {
      if (isLoading) return;

      if (!isAuthenticated) {
        router.push('/auth/login');
        return;
      }

      if (!hasRole(requiredRole)) {
        router.push(options?.redirectTo || '/403');
      }
    }, [isAuthenticated, isLoading, hasRole, router]);

    if (isLoading) {
      return <LoadingComponent />;
    }

    if (!isAuthenticated || !hasRole(requiredRole)) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}

/**
 * HOC to wrap a component with permission requirement
 */
export function withPermission<P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredPermission: string | string[],
  options?: {
    redirectTo?: string;
    LoadingComponent?: ComponentType;
  }
) {
  const LoadingComponent = options?.LoadingComponent || DefaultLoadingFallback;

  return function PermissionProtectedComponent(props: P) {
    const router = useRouter();
    const { isAuthenticated, isLoading, hasPermission } = useAuth();

    useEffect(() => {
      if (isLoading) return;

      if (!isAuthenticated) {
        router.push('/auth/login');
        return;
      }

      if (!hasPermission(requiredPermission)) {
        router.push(options?.redirectTo || '/403');
      }
    }, [isAuthenticated, isLoading, hasPermission, router]);

    if (isLoading) {
      return <LoadingComponent />;
    }

    if (!isAuthenticated || !hasPermission(requiredPermission)) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}

// =============================================================================
// Utility Components
// =============================================================================

/**
 * Shows children only when authenticated
 */
export function AuthenticatedOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Shows children only when NOT authenticated
 */
export function UnauthenticatedOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Shows children only when user has the specified role
 */
export function RoleOnly({
  children,
  role,
  fallback = null,
}: {
  children: ReactNode;
  role: string | string[];
  fallback?: ReactNode;
}) {
  const { hasRole, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!hasRole(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Shows children only when user has the specified permission
 */
export function PermissionOnly({
  children,
  permission,
  fallback = null,
}: {
  children: ReactNode;
  permission: string | string[];
  fallback?: ReactNode;
}) {
  const { hasPermission, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
