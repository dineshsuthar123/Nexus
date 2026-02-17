/**
 * Nexus RTP Platform - RegisterForm Stories
 * 
 * Storybook stories for the registration form component.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle, Check, X } from 'lucide-react';

import { Button } from '../Button';
import { Input } from '../Input';
import { Card } from '../Card';

// =============================================================================
// Password Strength Indicator
// =============================================================================

interface PasswordStrengthProps {
  password: string;
}

function PasswordStrengthIndicator({ password }: PasswordStrengthProps) {
  const requirements = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'Contains uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'Contains lowercase letter', test: (p: string) => /[a-z]/.test(p) },
    { label: 'Contains number', test: (p: string) => /\d/.test(p) },
    { label: 'Contains special character', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];

  const passed = requirements.filter(r => r.test(password)).length;
  const strength = password.length === 0 ? 0 : passed;

  const getStrengthColor = () => {
    if (strength <= 2) return 'bg-destructive';
    if (strength <= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthLabel = () => {
    if (strength <= 2) return 'Weak';
    if (strength <= 4) return 'Medium';
    return 'Strong';
  };

  return (
    <div className="space-y-3">
      {/* Strength Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          {password.length > 0 && (
            <span className={strength >= 4 ? 'text-green-600' : 'text-muted-foreground'}>
              {getStrengthLabel()}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getStrengthColor()}`}
            style={{ width: `${(strength / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      <ul className="space-y-1">
        {requirements.map((req, idx) => {
          const passes = req.test(password);
          return (
            <li
              key={idx}
              className={`flex items-center gap-2 text-xs transition-colors ${
                passes ? 'text-green-600' : 'text-muted-foreground'
              }`}
            >
              {passes ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
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
// RegisterForm Component (for Storybook)
// =============================================================================

interface RegisterFormProps {
  onSubmit?: (data: { 
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => void;
  isLoading?: boolean;
  error?: string | null;
  showSuccess?: boolean;
}

function RegisterForm({ 
  onSubmit,
  isLoading = false,
  error = null,
  showSuccess = false,
}: RegisterFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ firstName, lastName, email, password });
  };

  if (showSuccess) {
    return (
      <Card className="p-8 shadow-lg w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Check your email
          </h2>
          <p className="text-muted-foreground mb-6">
            We've sent a verification link to your email address.
            Please click the link to activate your account.
          </p>
          <Button variant="outline" className="w-full">
            Resend verification email
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 shadow-lg w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Start your 14-day free trial
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div 
          className="mb-6 flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-destructive"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
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
              disabled={isLoading}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
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
              disabled={isLoading}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

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
            disabled={isLoading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          
          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <PasswordStrengthIndicator password={password} />
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
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm your password"
            disabled={isLoading}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
        </div>

        {/* Terms Checkbox */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="h-4 w-4 rounded border-input mt-0.5"
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground">
            I agree to the{' '}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </label>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isLoading || !acceptTerms}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      {/* Sign In Link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <a href="#" className="text-primary hover:underline font-medium">
          Sign in
        </a>
      </p>
    </Card>
  );
}

// =============================================================================
// Storybook Configuration
// =============================================================================

const meta: Meta<typeof RegisterForm> = {
  title: 'Forms/RegisterForm',
  component: RegisterForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Registration form with password strength indicator, terms acceptance, and email verification flow.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onSubmit: { action: 'submitted' },
    isLoading: {
      control: 'boolean',
      description: 'Show loading state',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    showSuccess: {
      control: 'boolean',
      description: 'Show success/verification state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RegisterForm>;

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  args: {
    isLoading: false,
    error: null,
    showSuccess: false,
  },
};

export const WithError: Story = {
  args: {
    isLoading: false,
    error: 'An account with this email already exists. Please sign in instead.',
    showSuccess: false,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    error: null,
    showSuccess: false,
  },
};

export const Success: Story = {
  args: {
    isLoading: false,
    error: null,
    showSuccess: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Success state shown after registration, prompting user to verify their email.',
      },
    },
  },
};

export const ValidationError: Story = {
  args: {
    isLoading: false,
    error: 'Password does not meet security requirements. Please use at least 8 characters with uppercase, lowercase, numbers, and special characters.',
    showSuccess: false,
  },
};

export const ServerError: Story = {
  args: {
    isLoading: false,
    error: 'Unable to create account. Please try again later or contact support if the problem persists.',
    showSuccess: false,
  },
};
