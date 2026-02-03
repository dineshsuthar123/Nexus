/**
 * Nexus RTP Platform - NextAuth.js Configuration
 * 
 * Authentication setup with:
 * - Credentials provider (email/password)
 * - JWT strategy with refresh token rotation
 * - Role-based access control
 * - Session management
 */

import type { AuthOptions, User as NextAuthUser, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';

import { AUTH_ENDPOINTS, getBaseUrl } from '@/lib/api/endpoints';
import type { LoginResponse, User } from '@/lib/api/types';

// =============================================================================
// Type Extensions
// =============================================================================

declare module 'next-auth' {
  interface Session {
    user: User;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    error?: string;
  }

  interface User extends NextAuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    mfaEnabled: boolean;
    emailVerified: boolean;
    avatar?: string;
    organization?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    mfaEnabled: boolean;
    emailVerified: boolean;
    avatar?: string;
    organization?: string;
    error?: string;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(`${getBaseUrl()}${AUTH_ENDPOINTS.REFRESH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: token.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const refreshedTokens = await response.json();

    return {
      ...token,
      accessToken: refreshedTokens.accessToken,
      accessTokenExpires: Date.now() + refreshedTokens.expiresIn * 1000,
      refreshToken: refreshedTokens.refreshToken ?? token.refreshToken,
    };
  } catch (error) {
    console.error('[NextAuth] Error refreshing access token:', error);

    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

// =============================================================================
// Auth Configuration
// =============================================================================

export const authOptions: AuthOptions = {
  // Session configuration
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  // JWT configuration
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },

  // Pages configuration
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify-email',
    newUser: '/auth/welcome',
  },

  // Providers
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaCode: { label: 'MFA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        try {
          // Call the backend login endpoint
          const response = await fetch(`${getBaseUrl()}${AUTH_ENDPOINTS.LOGIN}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              mfaCode: credentials.mfaCode || undefined,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            // Handle specific error cases
            if (response.status === 401) {
              throw new Error(data.message || 'Invalid email or password');
            }
            if (response.status === 403 && data.code === 'MFA_REQUIRED') {
              throw new Error('MFA_REQUIRED');
            }
            if (response.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
              throw new Error('Please verify your email before logging in');
            }
            if (response.status === 429) {
              throw new Error('Too many login attempts. Please try again later.');
            }
            throw new Error(data.message || 'Authentication failed');
          }

          const loginResponse = data as LoginResponse;

          // Return user object for NextAuth
          return {
            id: loginResponse.user.id,
            email: loginResponse.user.email,
            name: `${loginResponse.user.firstName} ${loginResponse.user.lastName}`,
            firstName: loginResponse.user.firstName,
            lastName: loginResponse.user.lastName,
            role: loginResponse.user.role,
            permissions: loginResponse.user.permissions,
            accessToken: loginResponse.accessToken,
            refreshToken: loginResponse.refreshToken,
            accessTokenExpires: Date.now() + loginResponse.expiresIn * 1000,
            mfaEnabled: loginResponse.user.mfaEnabled,
            emailVerified: loginResponse.user.emailVerified,
            avatar: loginResponse.user.avatar,
            organization: loginResponse.user.organization,
          };
        } catch (error) {
          console.error('[NextAuth] Login error:', error);
          throw error;
        }
      },
    }),
  ],

  // Callbacks
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign in
      if (user) {
        return {
          ...token,
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          permissions: user.permissions,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: user.accessTokenExpires,
          mfaEnabled: user.mfaEnabled,
          emailVerified: user.emailVerified,
          avatar: user.avatar,
          organization: user.organization,
        };
      }

      // Update session from client
      if (trigger === 'update' && session) {
        return {
          ...token,
          ...session,
        };
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Access token has expired, try to refresh it
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      // Send properties to the client
      session.user = {
        id: token.id,
        email: token.email,
        firstName: token.firstName,
        lastName: token.lastName,
        role: token.role as 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'API_USER',
        permissions: token.permissions,
        mfaEnabled: token.mfaEnabled,
        emailVerified: token.emailVerified,
        avatar: token.avatar,
        organization: token.organization,
        createdAt: '',
        updatedAt: '',
      };
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.accessTokenExpires = token.accessTokenExpires;
      session.error = token.error;

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  // Events
  events: {
    async signIn({ user }) {
      console.log(`[NextAuth] User signed in: ${user.email}`);
    },
    async signOut() {
      console.log('[NextAuth] User signed out');
    },
    async session({ token }) {
      // Log token refresh errors
      if (token.error) {
        console.error('[NextAuth] Session error:', token.error);
      }
    },
  },

  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Secret for encryption
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
