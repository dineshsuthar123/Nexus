/**
 * Nexus RTP Platform - MFA Verification Page
 *
 * Multi-factor authentication with:
 * - OTP code input
 * - Backup code support
 * - Auto-submit on complete
 * - Accessible design
 */

'use client';

import { useState, useRef, useEffect, Suspense, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, Shield, ArrowLeft, KeyRound } from 'lucide-react';

import { Button, Card } from '@nexus/ui';
import { useAuth } from '@/lib/auth';

// =============================================================================
// OTP Input Component
// =============================================================================

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

function OtpInput({
  length,
  value,
  onChange,
  disabled,
  error,
  autoFocus = true
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, inputValue: string) => {
    // Only allow digits
    const digit = inputValue.replace(/\D/g, '').slice(-1);

    const newValue = value.split('');
    newValue[index] = digit;
    const updatedValue = newValue.join('').slice(0, length);
    onChange(updatedValue);

    // Move to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pastedData);

    // Focus the appropriate input after paste
    const focusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="One-time password">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`
            w-12 h-14 text-center text-2xl font-semibold
            rounded-lg border-2 bg-background
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-destructive' : 'border-input'}
          `}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function MfaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <MfaPageContent />
    </Suspense>
  );
}

function MfaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const email = searchParams.get('email') || '';

  const { login } = useAuth();

  const [otp, setOtp] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-submit when OTP is complete
  useEffect(() => {
    if (otp.length === 6 && !isSubmitting) {
      handleSubmit();
    }
  }, [otp]);

  const handleSubmit = async () => {
    const code = useBackupCode ? backupCode : otp;

    if (!code || (useBackupCode ? code.length < 8 : code.length < 6)) {
      setError('Please enter a valid code');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get the stored credentials from session storage
      const storedCredentials = sessionStorage.getItem('mfa_pending');
      if (!storedCredentials) {
        setError('Session expired. Please log in again.');
        router.push('/auth/login');
        return;
      }

      const { email: storedEmail, password } = JSON.parse(storedCredentials);

      const result = await login(storedEmail, password, code);

      if (result.success) {
        // Clear stored credentials
        sessionStorage.removeItem('mfa_pending');
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError(result.error || 'Invalid verification code. Please try again.');
        setOtp('');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setOtp('');
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-8 shadow-lg">
      <div className="mb-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          {useBackupCode ? (
            <KeyRound className="h-8 w-8 text-primary" aria-hidden="true" />
          ) : (
            <Shield className="h-8 w-8 text-primary" aria-hidden="true" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {useBackupCode ? 'Enter backup code' : 'Two-factor authentication'}
        </h1>
        <p className="text-muted-foreground">
          {useBackupCode
            ? 'Enter one of your backup codes to sign in'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-destructive"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {!useBackupCode ? (
          /* OTP Input */
          <div className="space-y-4">
            <OtpInput
              length={6}
              value={otp}
              onChange={setOtp}
              disabled={isSubmitting}
              error={!!error}
            />

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={otp.length < 6 || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        ) : (
          /* Backup Code Input */
          <div className="space-y-4">
            <div>
              <label
                htmlFor="backupCode"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Backup code
              </label>
              <input
                id="backupCode"
                type="text"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                placeholder="XXXX-XXXX"
                className={`
                  w-full h-12 text-center text-lg font-mono uppercase
                  rounded-lg border bg-background px-4
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${error ? 'border-destructive' : 'border-input'}
                `}
                aria-describedby={error ? 'backup-error' : undefined}
              />
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={backupCode.length < 8 || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        )}

        {/* Toggle between OTP and backup code */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setError(null);
              setOtp('');
              setBackupCode('');
            }}
            className="text-sm text-primary hover:underline"
            disabled={isSubmitting}
          >
            {useBackupCode
              ? 'Use authenticator app instead'
              : "Can't access your authenticator? Use a backup code"}
          </button>
        </div>

        {/* Back to login */}
        <Link href="/auth/login" className="block">
          <Button variant="outline" className="w-full" disabled={isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to login
          </Button>
        </Link>
      </div>

      {/* Help text */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Lost access to your authenticator app and backup codes?{' '}
        <Link href="/support" className="text-primary hover:underline">
          Contact support
        </Link>
      </p>
    </Card>
  );
}
