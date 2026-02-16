/**
 * Nexus RTP Platform - Reset Password Page
 *
 * Password reset with token validation and strong password requirements.
 */

'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, AlertCircle, Check, ArrowLeft, KeyRound } from 'lucide-react';

import { Button, Input, Card } from '@nexus/ui';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations/schemas';
import { post, AUTH_ENDPOINTS } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token || '',
      password: '',
      confirmPassword: '',
    },
  });

  // No token provided
  if (!token) {
    return (
      <Card className="p-8 shadow-lg text-center">
        <div className="mb-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Invalid reset link
          </h1>
          <p className="text-muted-foreground">
            This password reset link is invalid or has expired.
            Please request a new one.
          </p>
        </div>

        <Link href="/auth/forgot-password">
          <Button className="w-full">
            Request new reset link
          </Button>
        </Link>
      </Card>
    );
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await post(AUTH_ENDPOINTS.RESET_PASSWORD, {
        token: data.token,
        password: data.password,
      });
      setSuccess(true);
    } catch (err: any) {
      if (err.code === 'TOKEN_EXPIRED') {
        setError('This reset link has expired. Please request a new one.');
      } else if (err.code === 'TOKEN_INVALID') {
        setError('This reset link is invalid. Please request a new one.');
      } else {
        setError(err.message || 'Failed to reset password. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card className="p-8 shadow-lg text-center">
        <div className="mb-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Password reset successful
          </h1>
          <p className="text-muted-foreground">
            Your password has been reset successfully.
            You can now sign in with your new password.
          </p>
        </div>

        <Link href="/auth/login">
          <Button className="w-full">
            Sign in
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-8 shadow-lg">
      <div className="mb-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <KeyRound className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Set new password
        </h1>
        <p className="text-muted-foreground">
          Create a strong password that you haven't used before.
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Hidden token field */}
        <input type="hidden" {...register('token')} />

        {/* Password Field */}
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-foreground"
          >
            New password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              disabled={isSubmitting}
              aria-invalid={!!errors.password}
              className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Must be at least 8 characters with uppercase, lowercase, number, and special character.
          </p>
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-foreground"
          >
            Confirm new password
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm your password"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmPassword}
              className={`pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
              {...register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Resetting password...
            </>
          ) : (
            'Reset password'
          )}
        </Button>
      </form>

      {/* Back to login link */}
      <div className="mt-6 text-center">
        <Link
          href="/auth/login"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to login
        </Link>
      </div>
    </Card>
  );
}
