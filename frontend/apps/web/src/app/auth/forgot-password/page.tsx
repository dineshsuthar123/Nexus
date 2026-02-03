/**
 * Nexus RTP Platform - Forgot Password Page
 * 
 * Password reset request with email validation.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, AlertCircle, Check, ArrowLeft, Mail } from 'lucide-react';

import { Button, Input, Card } from '@nexus/ui';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations/schemas';
import { post, AUTH_ENDPOINTS } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await post(AUTH_ENDPOINTS.FORGOT_PASSWORD, { email: data.email });
      setEmail(data.email);
      setSuccess(true);
    } catch (err: any) {
      // For security, we don't reveal if the email exists
      // We show success either way
      setEmail(data.email);
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <Card className="p-8 shadow-lg text-center">
        <div className="mb-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Check your email
          </h1>
          <p className="text-muted-foreground">
            If an account exists for <strong>{email}</strong>, we've sent 
            password reset instructions to that email address.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Didn't receive the email? Check your spam folder or{' '}
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => {
                setSuccess(false);
                setEmail('');
              }}
            >
              try again
            </button>
          </p>
          
          <Link href="/auth/login">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to login
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 shadow-lg">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Forgot your password?
        </h1>
        <p className="text-muted-foreground">
          No worries, we'll send you reset instructions.
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

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending instructions...
            </>
          ) : (
            'Send reset instructions'
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
