# Nexus RTP Platform - Frontend

<!-- performance-results:start -->
### Measured local performance (2026-11-07)

| Payment attempts | p50 | p95 | p99 | Sustained accepted payments/s | Acceptance failures |
|---:|---:|---:|---:|---:|---:|
| 14,709 | 35.37 ms | 109.08 ms | 152.94 ms | 107.35 | 0.00% |

Direct API, 1–25 closed-loop users, real single-node in-memory CockroachDB and Redis.
Sanctions unavailable: payments were accepted for review. Settlement, Kafka delivery,
gateway/auth, production capacity and uptime were not measured.
Thresholds: **PASS**; persisted database invariants: **PASS**.

Frontend production lab, ten fresh-context navigations per route: median LCP `/` 750 ms, `/auth/login` 152 ms, `/performance` 68 ms. No CPU/network throttling.

See [methodology and raw evidence](../docs/performance/README.md). Other performance figures below are design targets or historical claims unless linked to a recorded run.
<!-- performance-results:end -->

Production-grade React/Next.js frontend for the Nexus Real-Time Payment & Settlement Network.

## 🚀 Features

- **Next.js 14** with App Router and React Server Components
- **TypeScript** with strict mode for type safety
- **NextAuth.js** for secure authentication with JWT sessions
- **React Query** for data fetching and caching
- **Tailwind CSS** with design tokens from `@nexus/ui`
- **Accessibility-first** components (WCAG 2.1 AA compliant)
- **Comprehensive testing** with Vitest, Testing Library, and Playwright

## 📁 Project Structure

```
frontend/
├── apps/
│   └── web/                     # Next.js application
│       ├── src/
│       │   ├── app/             # App Router pages
│       │   │   ├── auth/        # Authentication pages
│       │   │   │   ├── login/
│       │   │   │   ├── register/
│       │   │   │   ├── forgot-password/
│       │   │   │   ├── reset-password/
│       │   │   │   └── mfa/
│       │   │   ├── dashboard/
│       │   │   ├── payments/
│       │   │   └── ...
│       │   ├── lib/
│       │   │   ├── api/         # API client with auth injection
│       │   │   ├── auth/        # NextAuth config & hooks
│       │   │   └── hooks/       # React Query hooks
│       │   └── components/      # Shared components
│       ├── e2e/                 # Playwright E2E tests
│       └── __tests__/           # Unit tests
└── packages/
    └── ui/                      # Shared UI component library
        └── src/components/
            └── forms/           # Form Storybook stories
```

## 🔧 Prerequisites

- **Node.js** 18.17 or later
- **pnpm** 8.0 or later
- Backend services running (or mock server)

## 🏃 Quick Start

### 1. Install Dependencies

```bash
cd frontend
pnpm install
```

### 2. Configure Environment

Create `.env.local` in `apps/web/`:

```bash
# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-min-32-chars

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# OAuth Providers (optional)
GITHUB_ID=your-github-app-id
GITHUB_SECRET=your-github-app-secret
GOOGLE_ID=your-google-client-id
GOOGLE_SECRET=your-google-client-secret
```

Generate a secure `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

### 3. Start Development Server

```bash
pnpm --filter @nexus/web dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Mock Backend (Optional)

For frontend-only development without backend:

```bash
pnpm --filter @nexus/web dev:mock
```

## 🧪 Testing

### Unit Tests (Vitest)

```bash
# Run all tests
pnpm --filter @nexus/web test

# Watch mode
pnpm --filter @nexus/web test:watch

# With coverage
pnpm --filter @nexus/web test:coverage

# Interactive UI
pnpm --filter @nexus/web test:ui
```

### E2E Tests (Playwright)

```bash
# Install browsers (first time only)
pnpm exec playwright install

# Run all E2E tests
pnpm --filter @nexus/web test:e2e

# Run with UI mode
pnpm --filter @nexus/web test:e2e:ui

# Run accessibility tests only
pnpm --filter @nexus/web test:e2e -- --project=a11y

# Run specific test file
pnpm --filter @nexus/web test:e2e -- e2e/auth.spec.ts
```

### Storybook

```bash
# Start Storybook
pnpm --filter @nexus/ui storybook

# Build Storybook
pnpm --filter @nexus/ui storybook:build
```

## 🔐 Authentication

The frontend uses **NextAuth.js** with the following features:

### Authentication Flows

| Flow | Route | Description |
|------|-------|-------------|
| Login | `/auth/login` | Email/password with MFA support |
| Register | `/auth/register` | User registration with email verification |
| Forgot Password | `/auth/forgot-password` | Password reset request |
| Reset Password | `/auth/reset-password` | Password reset with token |
| MFA Verification | `/auth/mfa` | TOTP/backup code verification |

### Protected Routes

Use the `withAuth` HOC or `useRequireAuth` hook:

```tsx
// Option 1: HOC
import { withAuth } from '@/lib/auth';

function ProtectedPage() {
  return <div>Protected content</div>;
}

export default withAuth(ProtectedPage);

// Option 2: Hook
import { useRequireAuth } from '@/lib/auth';

function ProtectedPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();

  if (isLoading) return <Loading />;

  return <div>Protected content</div>;
}
```

### Role-Based Access

```tsx
import { withRole } from '@/lib/auth';

function AdminPage() {
  return <div>Admin only content</div>;
}

export default withRole(AdminPage, ['admin', 'super_admin']);
```

### API Client Token Injection

The API client automatically injects the session token:

```tsx
import { apiClient } from '@/lib/api';

// Token is automatically added to Authorization header
const payments = await apiClient.payments.list();
```

## 📊 Scripts Reference

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages |
| `pnpm type-check` | TypeScript type checking |
| `pnpm test` | Run all unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |

### Per-App Scripts

```bash
# Web app
pnpm --filter @nexus/web dev
pnpm --filter @nexus/web build
pnpm --filter @nexus/web test
pnpm --filter @nexus/web test:e2e

# UI library
pnpm --filter @nexus/ui storybook
pnpm --filter @nexus/ui build
```

## 🎨 Code Style

- **ESLint** with Next.js and TypeScript rules
- **Prettier** for code formatting
- **Strict TypeScript** - no `any` types allowed

```bash
# Lint
pnpm lint

# Auto-fix
pnpm lint:fix

# Format
pnpm format
```

## 📦 Build & Deploy

### Production Build

```bash
pnpm --filter @nexus/web build
pnpm --filter @nexus/web start
```

### Docker

```bash
# Build image
docker build -t nexus-web -f apps/web/Dockerfile .

# Run container
docker run -p 3000:3000 nexus-web
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_URL` | Yes | Full URL of your app (e.g., `https://app.nexus.com`) |
| `NEXTAUTH_SECRET` | Yes | Random string for JWT encryption (min 32 chars) |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |
| `GITHUB_ID` | No | GitHub OAuth app ID |
| `GITHUB_SECRET` | No | GitHub OAuth app secret |
| `GOOGLE_ID` | No | Google OAuth client ID |
| `GOOGLE_SECRET` | No | Google OAuth client secret |

## 🐛 Troubleshooting

### Common Issues

**1. "Failed to read source code from src/lib/auth/index.ts"**

Clear Next.js cache:
```bash
Remove-Item .next -Recurse -Force  # Windows
rm -rf .next                        # macOS/Linux
```

**2. "NEXTAUTH_SECRET is not set"**

Add to `.env.local`:
```bash
NEXTAUTH_SECRET=$(openssl rand -base64 32)
```

**3. Playwright tests fail to start**

Install browsers:
```bash
pnpm exec playwright install
```

**4. Type errors after updating packages**

Regenerate types:
```bash
pnpm type-check
```

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Playwright Documentation](https://playwright.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feat/ui/your-feature`
2. Make changes following the code style guide
3. Write tests for new functionality
4. Run `pnpm test` and `pnpm lint`
5. Create a Pull Request

## 📄 License

Apache License 2.0 - see [LICENSE](../LICENSE) for details.
