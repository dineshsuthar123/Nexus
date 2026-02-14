/**
 * Nexus RTP Platform - Test Setup
 * 
 * Global test configuration and mocks for Vitest + React Testing Library.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';

// =============================================================================
// Cleanup after each test
// =============================================================================

afterEach(() => {
  cleanup();
});

// =============================================================================
// Mock Next.js
// =============================================================================

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
  useParams: () => ({}),
  usePathname: () => '/',
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage(props: any) {
    return React.createElement('img', { src: props.src, alt: props.alt, ...props });
  },
}));

// =============================================================================
// Mock next-auth
// =============================================================================

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    status: 'authenticated',
    update: vi.fn(),
  }),
  signIn: vi.fn(() => Promise.resolve({ ok: true })),
  signOut: vi.fn(() => Promise.resolve()),
  SessionProvider: function MockSessionProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  },
}));

// =============================================================================
// Mock window.matchMedia
// =============================================================================

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// =============================================================================
// Mock IntersectionObserver
// =============================================================================

const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
});
window.IntersectionObserver = mockIntersectionObserver;

// =============================================================================
// Mock ResizeObserver
// =============================================================================

const mockResizeObserver = vi.fn();
mockResizeObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null,
});
window.ResizeObserver = mockResizeObserver;

// =============================================================================
// Mock fetch
// =============================================================================

global.fetch = vi.fn();

// =============================================================================
// Suppress console errors in tests (optional)
// =============================================================================

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const suppressedErrors = [
      'Warning: ReactDOM.render is no longer supported',
      'Warning: An update to',
      'Error: Not implemented: navigation',
    ];
    
    if (suppressedErrors.some(msg => args[0]?.includes?.(msg))) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});
// =============================================================================
// Extend expect matchers
// =============================================================================

// Custom matchers could be added here if needed
