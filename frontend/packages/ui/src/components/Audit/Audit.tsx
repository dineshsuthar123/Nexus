'use client';

import * as React from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  Hash,
  Key,
  Lock,
  Fingerprint,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Clock
} from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { Badge } from '../Badge';
import { SimpleTooltip } from '../Tooltip';

/* -----------------------------------------------------------------------------
 * Audit Badge - Shows verification status
 * -------------------------------------------------------------------------- */

export type VerificationStatus =
  | 'verified'
  | 'pending'
  | 'failed'
  | 'not_verified'
  | 'expired';

const verificationConfig: Record<VerificationStatus, {
  icon: React.ElementType;
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'outline' | 'default';
}> = {
  verified: { icon: ShieldCheck, label: 'Verified', variant: 'success' },
  pending: { icon: Clock, label: 'Pending', variant: 'warning' },
  failed: { icon: ShieldAlert, label: 'Failed', variant: 'danger' },
  not_verified: { icon: Shield, label: 'Not Verified', variant: 'outline' },
  expired: { icon: ShieldAlert, label: 'Expired', variant: 'danger' },
};

export interface AuditBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: VerificationStatus;
  /** Show icon only */
  iconOnly?: boolean;
  /** Size */
  size?: 'sm' | 'md' | 'lg';
}

const AuditBadge = React.forwardRef<HTMLSpanElement, AuditBadgeProps>(
  ({ status, iconOnly = false, size = 'md', className, ...props }, ref) => {
    const config = verificationConfig[status];
    const Icon = config.icon;

    if (iconOnly) {
      return (
        <SimpleTooltip content={config.label}>
          <span
            ref={ref}
            className={cn(
              'inline-flex items-center justify-center',
              status === 'verified' && 'text-success-500',
              status === 'pending' && 'text-warning-500',
              status === 'failed' && 'text-danger-500',
              status === 'not_verified' && 'text-neutral-400',
              status === 'expired' && 'text-danger-500',
              className
            )}
            {...props}
          >
            <Icon className={cn(
              size === 'sm' && 'h-4 w-4',
              size === 'md' && 'h-5 w-5',
              size === 'lg' && 'h-6 w-6'
            )} />
          </span>
        </SimpleTooltip>
      );
    }

    return (
      <Badge
        ref={ref}
        variant={config.variant}
        size={size}
        icon={<Icon className="h-3.5 w-3.5" />}
        className={className}
        {...props}
      >
        {config.label}
      </Badge>
    );
  }
);
AuditBadge.displayName = 'AuditBadge';

/* -----------------------------------------------------------------------------
 * Hash Display - Shows cryptographic hash with copy functionality
 * -------------------------------------------------------------------------- */

export interface HashDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Full hash value */
  hash: string;
  /** Hash type label */
  type?: 'SHA-256' | 'SHA-384' | 'SHA-512' | 'MD5' | 'BLAKE3' | string;
  /** Number of characters to show at start and end */
  truncateLength?: number;
  /** Show copy button */
  copyable?: boolean;
  /** Show external link */
  explorerUrl?: string;
  /** Verification status */
  verified?: boolean;
}

const HashDisplay = React.forwardRef<HTMLDivElement, HashDisplayProps>(
  (
    {
      hash,
      type,
      truncateLength = 8,
      copyable = true,
      explorerUrl,
      verified,
      className,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);

    const truncatedHash = hash.length > truncateLength * 2 + 3
      ? `${hash.slice(0, truncateLength)}...${hash.slice(-truncateLength)}`
      : hash;

    const handleCopy = async () => {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800',
          className
        )}
        {...props}
      >
        <Hash className="h-3.5 w-3.5 text-neutral-500" />

        {type && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {type}:
          </span>
        )}

        <code className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
          {truncatedHash}
        </code>

        {verified !== undefined && (
          <SimpleTooltip content={verified ? 'Hash verified' : 'Verification failed'}>
            {verified ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-danger-500" />
            )}
          </SimpleTooltip>
        )}

        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            aria-label={copied ? 'Copied!' : 'Copy hash'}
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-neutral-500" />
            )}
          </button>
        )}

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            aria-label="View in explorer"
          >
            <ExternalLink className="h-3.5 w-3.5 text-neutral-500" />
          </a>
        )}
      </div>
    );
  }
);
HashDisplay.displayName = 'HashDisplay';

/* -----------------------------------------------------------------------------
 * Audit Trail Entry
 * -------------------------------------------------------------------------- */

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  actorType: 'user' | 'system' | 'api';
  timestamp: Date | string;
  details?: string;
  ipAddress?: string;
  hash?: string;
  verified?: boolean;
}

export interface AuditTrailEntryProps extends React.HTMLAttributes<HTMLDivElement> {
  entry: AuditEntry;
  /** Show verification badge */
  showVerification?: boolean;
  /** Show hash */
  showHash?: boolean;
}

const AuditTrailEntry = React.forwardRef<HTMLDivElement, AuditTrailEntryProps>(
  ({ entry, showVerification = true, showHash = false, className, ...props }, ref) => {
    const actorIcon = {
      user: Fingerprint,
      system: Lock,
      api: Key,
    }[entry.actorType];
    const ActorIcon = actorIcon;

    const formattedTime = typeof entry.timestamp === 'string'
      ? entry.timestamp
      : formatRelativeTime(entry.timestamp);

    return (
      <div
        ref={ref}
        className={cn(
          'flex gap-3 border-l-2 border-neutral-200 pl-4 dark:border-neutral-700',
          className
        )}
        {...props}
      >
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <ActorIcon className="h-3.5 w-3.5 text-neutral-500" />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {entry.action}
            </p>
            {showVerification && entry.verified !== undefined && (
              <AuditBadge status={entry.verified ? 'verified' : 'failed'} iconOnly size="sm" />
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{entry.actor}</span>
            <span>•</span>
            <span>{formattedTime}</span>
            {entry.ipAddress && (
              <>
                <span>•</span>
                <span>{entry.ipAddress}</span>
              </>
            )}
          </div>

          {entry.details && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {entry.details}
            </p>
          )}

          {showHash && entry.hash && (
            <HashDisplay hash={entry.hash} verified={entry.verified} />
          )}
        </div>
      </div>
    );
  }
);
AuditTrailEntry.displayName = 'AuditTrailEntry';

/* -----------------------------------------------------------------------------
 * Audit Trail
 * -------------------------------------------------------------------------- */

export interface AuditTrailProps extends React.HTMLAttributes<HTMLDivElement> {
  entries: AuditEntry[];
  /** Show verification badges */
  showVerification?: boolean;
  /** Show hashes */
  showHash?: boolean;
  /** Empty state */
  emptyContent?: React.ReactNode;
}

const AuditTrail = React.forwardRef<HTMLDivElement, AuditTrailProps>(
  (
    {
      entries,
      showVerification = true,
      showHash = false,
      emptyContent,
      className,
      ...props
    },
    ref
  ) => {
    if (entries.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          {emptyContent || (
            <>
              <FileCheck className="mb-2 h-8 w-8 text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No audit entries to display
              </p>
            </>
          )}
        </div>
      );
    }

    return (
      <div ref={ref} className={cn('space-y-4', className)} {...props}>
        {entries.map((entry) => (
          <AuditTrailEntry
            key={entry.id}
            entry={entry}
            showVerification={showVerification}
            showHash={showHash}
          />
        ))}
      </div>
    );
  }
);
AuditTrail.displayName = 'AuditTrail';

/* -----------------------------------------------------------------------------
 * Signature Verification Card
 * -------------------------------------------------------------------------- */

export interface SignatureVerificationProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Signature value */
  signature: string;
  /** Public key or key ID */
  keyId?: string;
  /** Signed at timestamp */
  signedAt?: Date | string;
  /** Verification status */
  status: VerificationStatus;
  /** Algorithm used */
  algorithm?: string;
}

const SignatureVerification = React.forwardRef<HTMLDivElement, SignatureVerificationProps>(
  (
    {
      signature,
      keyId,
      signedAt,
      status,
      algorithm,
      className,
      ...props
    },
    ref
  ) => {
    const config = verificationConfig[status];
    const StatusIcon = config.icon;

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border p-4',
          status === 'verified' && 'border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950',
          status === 'failed' && 'border-danger-200 bg-danger-50 dark:border-danger-800 dark:bg-danger-950',
          status === 'pending' && 'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950',
          (status === 'not_verified' || status === 'expired') && 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800',
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          <StatusIcon className={cn(
            'h-5 w-5 shrink-0',
            status === 'verified' && 'text-success-500',
            status === 'failed' && 'text-danger-500',
            status === 'pending' && 'text-warning-500',
            (status === 'not_verified' || status === 'expired') && 'text-neutral-500'
          )} />

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                Digital Signature
              </h4>
              <AuditBadge status={status} size="sm" />
            </div>

            <div className="space-y-1 text-sm">
              {algorithm && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Algorithm: <span className="font-mono">{algorithm}</span>
                </p>
              )}
              {keyId && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Key ID: <span className="font-mono">{keyId}</span>
                </p>
              )}
              {signedAt && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  Signed: {typeof signedAt === 'string' ? signedAt : formatRelativeTime(signedAt)}
                </p>
              )}
            </div>

            <HashDisplay
              hash={signature}
              truncateLength={12}
              copyable
            />
          </div>
        </div>
      </div>
    );
  }
);
SignatureVerification.displayName = 'SignatureVerification';

export {
  AuditBadge,
  HashDisplay,
  AuditTrailEntry,
  AuditTrail,
  SignatureVerification,
  verificationConfig,
};
