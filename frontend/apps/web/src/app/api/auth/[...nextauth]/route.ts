/**
 * Nexus RTP Platform - NextAuth API Route Handler
 * 
 * Handles all authentication routes for NextAuth.js
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
