/**
 * Nexus RTP Platform - Auth Module Index
 * 
 * Exports auth utilities, hooks, and helpers.
 */

export { authOptions } from './auth-options';
export { getServerSession, useAuth, useSession, useRequireAuth } from './auth-hooks';
export { withAuth, withRole, withPermission } from './auth-guards';
export type { AuthGuardProps, ProtectedRouteProps } from './auth-guards';
