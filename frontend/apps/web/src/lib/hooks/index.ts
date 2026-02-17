/**
 * Nexus RTP Platform - Hooks Module Index
 * 
 * Exports all custom React Query hooks.
 */

// Auth hooks
export {
  authKeys,
  useCurrentUser,
  useRegister,
  useForgotPassword,
  useResetPassword,
  useMfaSetup,
  useMfaVerify,
  useMfaDisable,
  useVerifyEmail,
} from './use-auth';

// Payment hooks
export {
  paymentKeys,
  usePayments,
  useInfinitePayments,
  usePayment,
  usePaymentStatus,
  useCreatePayment,
  useSettlePayment,
  useReturnPayment,
  useCancelPayment,
  usePrefetchPayment,
  useInvalidatePayments,
} from './use-payments';

// Account hooks
export {
  accountKeys,
  useAccounts,
  useInfiniteAccounts,
  useAccount,
  useAccountBalance,
  useAccountTransactions,
  useAccountAudit,
  useCreateAccount,
  useUpdateAccount,
  useUpdateAccountStatus,
  useUpdateAccountKyc,
  usePrefetchAccount,
  useInvalidateAccounts,
} from './use-accounts';

// Reconciliation hooks
export {
  reconciliationKeys,
  useReconciliationCycles,
  useReconciliationCycle,
  useDiscrepancies,
  useRunReconciliation,
  useResolveDiscrepancy,
  usePrefetchReconciliationCycle,
  useInvalidateReconciliation,
  useReconciliationCyclePolling,
} from './use-reconciliation';

// Analytics hooks
export {
  analyticsKeys,
  useDashboardSummary,
  useVolumeAnalytics,
  usePerformanceMetrics,
  useTrendData,
  useSystemHealth,
  useDashboardData,
} from './use-analytics';

// Audit hooks
export {
  auditKeys,
  useAuditBundles,
  useAuditBundle,
  useVerifyBundle,
  useAuditBundleByReference,
  useCreateAuditBundle,
  useDownloadBundle,
  usePrefetchAuditBundle,
  useInvalidateAuditBundles,
} from './use-audit';

// Notification hooks
export {
  notificationKeys,
  useNotificationList,
  useNotificationPreferences,
  useCreateNotification,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useUpdateNotificationPreferences,
  useInvalidateNotifications,
} from './use-notifications';

// Notification types (re-export for convenience)
export type {
  Notification as NotificationItem,
  PaginatedNotifications,
  NotificationPreference,
  CreateNotificationRequest,
  UpdatePreferenceRequest,
} from './use-notifications';

// User & Settings hooks
export {
  userKeys,
  useUserProfile,
  useUpdateProfile,
  useChangePassword,
  useAPIKeys,
  useCreateAPIKey,
  useRevokeAPIKey,
  useInvalidateUserData,
} from './use-user';

// User types (re-export for convenience)
export type {
  UserProfile,
  UpdateProfileRequest,
  ChangePasswordRequest,
  APIKey,
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from './use-user';

// WebSocket hooks (re-export from websocket module)
export {
  useAccountUpdates,
  usePaymentUpdates,
  useNotifications,
} from '../websocket';