/**
 * Nexus RTP Platform - Registration Page
 * 
 * Account registration with:
 * - Email/password signup
 * - Password strength validation
 * - Terms acceptance
 * - Form validation with Zod
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, AlertCircle, Check, X } from 'lucide-react';

import { Button, Input, Card } from '@nexus/ui';
import { registerSchema, type RegisterFormData } from '@/lib/validations/schemas';
import { post, AUTH_ENDPOINTS } from '@/lib/api';

// =============================================================================
// Password Strength Component
// =============================================================================

interface PasswordStrengthProps {
  password: string;
}

function PasswordStrength({ password }: PasswordStrengthProps) {
  const requirements = [
    { regex: /.{8,}/, label: 'At least 8 characters' },
    { regex: /[A-Z]/, label: 'One uppercase letter' },
    { regex: /[a-z]/, label: 'One lowercase letter' },
    { regex: /[0-9]/, label: 'One number' },
    { regex: /[^A-Za-z0-9]/, label: 'One special character' },
  ];

  const metRequirements = requirements.filter((req) => req.regex.test(password));
  const strength = metRequirements.length;

  const getStrengthColor = () => {
    if (strength <= 2) return 'bg-destructive';
    if (strength <= 3) return 'bg-yellow-500';
    if (strength <= 4) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStrengthLabel = () => {
    if (strength <= 2) return 'Weak';
    if (strength <= 3) return 'Fair';
    if (strength <= 4) return 'Good';
    return 'Strong';
  };

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${getStrengthColor()} transition-all duration-300`}
            style={{ width: `${(strength / 5) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{getStrengthLabel()}</span>
      </div>

      {/* Requirements list */}
      <ul className="space-y-1">
        {requirements.map((req, index) => {
          const isMet = req.regex.test(password);
          return (
            <li
              key={index}
              className={`flex items-center gap-2 text-xs ${
                isMet ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
              }`}
            >
              {isMet ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <X className="h-3 w-3" aria-hidden="true" />
              )}
              {req.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function RegisterPage() {
  const router = useRouter();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      organization: '',
      acceptTerms: false,
    },
  });

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await post(AUTH_ENDPOINTS.REGISTER, {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        organization: data.organization || undefined,
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
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
            Check your email
          </h1>
          <p className="text-muted-foreground">
            We've sent a verification link to your email address. 
            Please click the link to activate your account.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/auth/login')}
          >
            Back to login
          </Button>
          
          <p className="text-sm text-muted-foreground">
            Didn't receive the email?{' '}
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => {
                // TODO: Implement resend verification email
                alert('Verification email resent!');
              }}
            >
              Click to resend
            </button>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 shadow-lg">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Start processing real-time payments today
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
        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label 
              htmlFor="firstName" 
              className="block text-sm font-medium text-foreground"
            >
              First name
            </label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="John"
              disabled={isSubmitting}
              aria-invalid={!!errors.firstName}
              className={errors.firstName ? 'border-destructive' : ''}
              {...register('firstName')}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label 
              htmlFor="lastName" 
              className="block text-sm font-medium text-foreground"
            >
              Last name
            </label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Doe"
              disabled={isSubmitting}
              aria-invalid={!!errors.lastName}
              className={errors.lastName ? 'border-destructive' : ''}
              {...register('lastName')}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label 
            htmlFor="email" 
            className="block text-sm font-medium text-foreground"
          >
            Work email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            disabled={isSubmitting}
            aria-invalid={!!errors.email}
            className={errors.email ? 'border-destructive' : ''}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Organization Field */}
        <div className="space-y-2">
          <label 
            htmlFor="organization" 
            className="block text-sm font-medium text-foreground"
          >
            Organization <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="organization"
            type="text"
            autoComplete="organization"
            placeholder="Acme Inc."
            disabled={isSubmitting}
            {...register('organization')}
          />
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label 
            htmlFor="password" 
            className="block text-sm font-medium text-foreground"
          >
            Password
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
          <PasswordStrength password={password} />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <label 
            htmlFor="confirmPassword" 
            className="block text-sm font-medium text-foreground"
          >
            Confirm password
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

        {/* Terms Checkbox */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <input
              id="acceptTerms"
              type="checkbox"
              className="h-4 w-4 mt-0.5 rounded border-border text-primary focus:ring-primary"
              {...register('acceptTerms')}
            />
            <label 
              htmlFor="acceptTerms" 
              className="text-sm text-muted-foreground"
            >
              I agree to the{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="text-sm text-destructive">{errors.acceptTerms.message}</p>
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
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      {/* Sign in link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/auth/login"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
