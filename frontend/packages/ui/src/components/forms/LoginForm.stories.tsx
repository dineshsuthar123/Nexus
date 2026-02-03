/**
 * Nexus RTP Platform - LoginForm Stories
 * 
 * Storybook stories for the login form component.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

import { Button } from '../../Button';
import { Input } from '../../Input';
import { Card } from '../../Card';

// =============================================================================
// LoginForm Component (for Storybook)
// =============================================================================

interface LoginFormProps {
  onSubmit?: (data: { email: string; password: string }) => void;
  isLoading?: boolean;
  error?: string | null;
  showMfa?: boolean;
}

function LoginForm({ 
  onSubmit,
  isLoading = false,
  error = null,
  showMfa = false,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ email, password });
  };

  return (
    <Card className="p-8 shadow-lg w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          {showMfa 
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
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!showMfa ? (
        <form onSubmit={handleSubmit} className="space-y-5">
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
            <div className="flex items-center justify-between">
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <a
                href="#"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
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
          </div>

          {/* Remember Me */}
          <div className="flex items-center gap-2">
            <input
              id="remember"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="remember" className="text-sm text-muted-foreground">
              Remember me for 30 days
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      ) : (
        /* MFA Input */
        <div className="space-y-4">
          <div className="space-y-2">
            <label 
              htmlFor="mfaCode" 
              className="block text-sm font-medium text-foreground"
            >
              Verification code
            </label>
            <Input
              id="mfaCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              disabled={isLoading}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-lg tracking-widest"
            />
          </div>
          
          <Button
            type="button"
            disabled={isLoading || mfaCode.length < 6}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </Button>
        </div>
      )}

      {/* Sign Up Link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <a href="#" className="text-primary hover:underline font-medium">
          Sign up
        </a>
      </p>
    </Card>
  );
}

// =============================================================================
// Storybook Configuration
// =============================================================================

const meta: Meta<typeof LoginForm> = {
  title: 'Forms/LoginForm',
  component: LoginForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Login form with email/password authentication, password visibility toggle, and MFA support.',
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
    showMfa: {
      control: 'boolean',
      description: 'Show MFA input instead of login form',
    },
  },
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

// =============================================================================
// Stories
// =============================================================================

export const Default: Story = {
  args: {
    isLoading: false,
    error: null,
    showMfa: false,
  },
};

export const WithError: Story = {
  args: {
    isLoading: false,
    error: 'Invalid email or password. Please try again.',
    showMfa: false,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    error: null,
    showMfa: false,
  },
};

export const MfaRequired: Story = {
  args: {
    isLoading: false,
    error: null,
    showMfa: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Login form in MFA verification mode, shown after successful email/password authentication.',
      },
    },
  },
};

export const MfaWithError: Story = {
  args: {
    isLoading: false,
    error: 'Invalid verification code. Please try again.',
    showMfa: true,
  },
};

export const NetworkError: Story = {
  args: {
    isLoading: false,
    error: 'Unable to connect to the server. Please check your internet connection and try again.',
    showMfa: false,
  },
};

export const TooManyAttempts: Story = {
  args: {
    isLoading: false,
    error: 'Too many login attempts. Please wait 5 minutes before trying again.',
    showMfa: false,
  },
};
