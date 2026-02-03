/**
 * Nexus RTP Platform - Login Page
 * 
 * Secure login page with:
 * - Email/password authentication
 * - Form validation with Zod
 * - MFA support
 * - Remember me functionality
 * - Password visibility toggle
 * - Error handling and feedback
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, AlertCircle, Shield } from 'lucide-react';

import { Button, Input, Card } from '@nexus/ui';
import { useAuth } from '@/lib/auth';
import { loginSchema, type LoginFormData } from '@/lib/validations/schemas';

// =============================================================================
// Component
// =============================================================================

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  
  const { login } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showMfaInput, setShowMfaInput] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await login(data.email, data.password, showMfaInput ? mfaCode : undefined);

      if (result.success) {
        router.push(callbackUrl);
        router.refresh();
      } else if (result.mfaRequired) {
        setShowMfaInput(true);
        setIsSubmitting(false);
      } else {
        setError(result.error || 'Login failed. Please check your credentials.');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleMfaSubmit = async () => {
    const { email, password } = getValues();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await login(email, password, mfaCode);

      if (result.success) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError(result.error || 'Invalid verification code.');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-8 shadow-lg">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          {showMfaInput 
            ? 'Enter your verification code to continue'
            : 'Sign in to access your account'}
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

      {!showMfaInput ? (
        /* Login Form */
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email Field */}
          <div className="space-y-2">
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isSubmitting}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={errors.email ? 'border-destructive' : ''}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-primary hover:underline"
                tabIndex={-1}
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={isSubmitting}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
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
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center gap-2">
            <input
              id="rememberMe"
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              {...register('rememberMe')}
            />
            <label 
              htmlFor="rememberMe" 
              className="text-sm text-muted-foreground"
            >
              Remember me for 30 days
            </label>
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
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      ) : (
        /* MFA Form */
        <div className="space-y-5">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label 
              htmlFor="mfaCode" 
              className="block text-sm font-medium text-foreground"
            >
              Verification Code
            </label>
            <Input
              id="mfaCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              disabled={isSubmitting}
              className="text-center text-2xl tracking-widest"
            />
            <p className="text-sm text-muted-foreground text-center">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={isSubmitting || mfaCode.length !== 6}
            onClick={handleMfaSubmit}
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

          <button
            type="button"
            onClick={() => {
              setShowMfaInput(false);
              setMfaCode('');
              setError(null);
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to login
          </button>
        </div>
      )}

      {/* Sign up link */}
      {!showMfaInput && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link
            href="/auth/register"
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      )}
    </Card>
  );
}
