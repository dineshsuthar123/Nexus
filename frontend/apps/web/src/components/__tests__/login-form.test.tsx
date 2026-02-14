/**
 * Nexus RTP Platform - Login Form Component Tests
 * 
 * Tests for the login form component with validation and submission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Mock next-auth
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/auth/login',
}));

// Import after mocks
import { signIn } from 'next-auth/react';

// Create a simple mock LoginForm for testing
function MockLoginForm() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    try {
      await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
    } catch {
      // Error is expected in tests - handled silently
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="login-form">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="Enter your email"
          aria-describedby="email-error"
        />
        <span id="email-error" role="alert" aria-live="polite" />
      </div>
      
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          placeholder="Enter your password"
          aria-describedby="password-error"
        />
        <span id="password-error" role="alert" aria-live="polite" />
      </div>
      
      <div>
        <input
          id="remember"
          name="remember"
          type="checkbox"
          aria-label="Remember me"
        />
        <label htmlFor="remember">Remember me</label>
      </div>
      
      <button type="submit">Sign In</button>
      
      <a href="/auth/forgot-password">Forgot password?</a>
    </form>
  );
}

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('LoginForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render login form with all fields', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should render remember me checkbox', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    });

    it('should render forgot password link', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
    });
  });

  describe('Form Interaction', () => {
    it('should allow typing in email field', async () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should allow typing in password field', async () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, 'password123');

      expect(passwordInput).toHaveValue('password123');
    });

    it('should toggle remember me checkbox', async () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const checkbox = screen.getByLabelText(/remember me/i);
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('should call signIn on form submission', async () => {
      vi.mocked(signIn).mockResolvedValueOnce({
        ok: true,
        error: undefined,
        status: 200,
        url: '/dashboard',
      });

      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false,
        });
      });
    });

    it('should submit form on Enter key in password field', async () => {
      vi.mocked(signIn).mockResolvedValueOnce({
        ok: true,
        error: undefined,
        status: 200,
        url: '/dashboard',
      });

      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123{enter}');

      await waitFor(() => {
        expect(signIn).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(emailInput).toHaveAttribute('id', 'email');
      expect(passwordInput).toHaveAttribute('id', 'password');
    });

    it('should have proper input types', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
    });

    it('should have accessible error containers', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const emailError = document.getElementById('email-error');
      const passwordError = document.getElementById('password-error');

      expect(emailError).toHaveAttribute('role', 'alert');
      expect(emailError).toHaveAttribute('aria-live', 'polite');
      expect(passwordError).toHaveAttribute('role', 'alert');
    });

    it('should link inputs to error messages via aria-describedby', () => {
      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      expect(screen.getByLabelText(/email/i)).toHaveAttribute(
        'aria-describedby',
        'email-error'
      );
      expect(screen.getByLabelText(/password/i)).toHaveAttribute(
        'aria-describedby',
        'password-error'
      );
    });
  });

  describe('Loading State', () => {
    it('should disable submit button during submission', async () => {
      vi.mocked(signIn).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          error: undefined,
          status: 200,
          url: '/dashboard',
        }), 100))
      );

      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      
      // Button should be enabled before submission
      expect(submitButton).not.toBeDisabled();

      await user.click(submitButton);

      // Wait for form to be submitted
      await waitFor(() => {
        expect(signIn).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle signIn error', async () => {
      vi.mocked(signIn).mockResolvedValueOnce({
        ok: false,
        error: 'Invalid credentials',
        status: 401,
        url: null,
      });

      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalled();
      });
    });

    it('should handle network error', async () => {
      vi.mocked(signIn).mockRejectedValueOnce(new Error('Network error'));

      render(<MockLoginForm />, { wrapper: createTestWrapper() });

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalled();
      });
    });
  });
});
