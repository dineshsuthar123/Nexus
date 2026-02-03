/**
 * Nexus RTP Platform - Auth Layout
 * 
 * Layout for authentication pages (login, register, forgot password, etc.)
 * Features a clean, centered design with branding.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* Header with logo */}
      <header className="py-6 px-4">
        <Link 
          href="/" 
          className="flex items-center gap-2 justify-center"
          aria-label="Go to homepage"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            N
          </div>
          <span className="text-xl font-bold text-foreground">
            Nexus <span className="text-primary">RTP</span>
          </span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-sm text-muted-foreground">
        <div className="flex flex-wrap justify-center gap-4 mb-2">
          <Link 
            href="/privacy" 
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <Link 
            href="/terms" 
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link 
            href="/help" 
            className="hover:text-foreground transition-colors"
          >
            Help Center
          </Link>
        </div>
        <p>
          © {new Date().getFullYear()} Nexus RTP Platform. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
