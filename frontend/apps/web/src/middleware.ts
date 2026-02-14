/**
 * Nexus RTP Platform - Next.js Middleware
 * 
 * Handles:
 * - Route protection (authentication required)
 * - Role-based access control
 * - Redirect handling
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// =============================================================================
// Configuration
// =============================================================================

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/payments',
  '/accounts',
  '/reconciliation',
  '/settings',
  '/profile',
];

// Routes that are only accessible to unauthenticated users
const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// Public routes (no auth required)
const PUBLIC_ROUTES = [
  '/',
  '/docs',
  '/help',
  '/privacy',
  '/terms',
  '/api/health',
];

// Role-based route restrictions
const ROLE_RESTRICTIONS: Record<string, string[]> = {
  '/settings/users': ['ADMIN'],
  '/settings/security': ['ADMIN'],
  '/settings/api-keys': ['ADMIN', 'OPERATOR'],
};

// =============================================================================
// Helper Functions
// =============================================================================

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

function getRequiredRoles(pathname: string): string[] | null {
  for (const [route, roles] of Object.entries(ROLE_RESTRICTIONS)) {
    if (pathname.startsWith(route)) {
      return roles;
    }
  }
  return null;
}

// =============================================================================
// Middleware
// =============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes (except auth-related)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next();
  }

  // Get the session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;
  const userRole = token?.role as string | undefined;

  // Handle auth routes (login, register, etc.)
  if (isAuthRoute(pathname)) {
    if (isAuthenticated) {
      // Redirect authenticated users away from auth pages
      const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
      return NextResponse.redirect(
        new URL(callbackUrl || '/dashboard', request.url)
      );
    }
    return NextResponse.next();
  }

  // Handle protected routes
  if (isProtectedRoute(pathname)) {
    if (!isAuthenticated) {
      // Redirect unauthenticated users to login
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check role-based restrictions
    const requiredRoles = getRequiredRoles(pathname);
    if (requiredRoles && userRole && !requiredRoles.includes(userRole)) {
      // User doesn't have required role
      return NextResponse.redirect(new URL('/403', request.url));
    }

    return NextResponse.next();
  }

  // Public routes - allow access
  return NextResponse.next();
}

// =============================================================================
// Matcher Configuration
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
