import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@nexus/ui';
import { 
  ArrowRight, 
  Shield, 
  Zap, 
  Globe, 
  BarChart3, 
  Lock, 
  CheckCircle 
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              Nexus RTP
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Sign In
            </Link>
            <Button asChild>
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-neutral-50 py-20 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <Badge variant="secondary" className="mb-4">
            Enterprise-Grade Real-Time Payments
          </Badge>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-5xl lg:text-6xl">
            The Future of{' '}
            <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
              Payment Infrastructure
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
            Process millions of transactions with cryptographic audit proofs, 
            deterministic replay, and enterprise-grade security. Built for the 
            modern financial ecosystem.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                Open Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/docs">
                View Documentation
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Enterprise Features
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              Built for scale, security, and compliance
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} variant="default" hover>
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-neutral-600 dark:text-neutral-400">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-neutral-200 bg-neutral-50 py-16 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-bold text-primary-500">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary-500 px-6 py-16 text-center sm:px-12 lg:px-16">
            <h2 className="text-3xl font-bold text-white">
              Ready to transform your payment infrastructure?
            </h2>
            <p className="mt-4 text-lg text-primary-100">
              Get started with Nexus RTP Platform today.
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-8 bg-white text-primary-600 hover:bg-neutral-100"
              asChild
            >
              <Link href="/dashboard">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-12 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary-500 text-white">
                <Zap className="h-4 w-4" />
              </div>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                Nexus RTP
              </span>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              © {new Date().getFullYear()} Nexus RTP Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    title: 'Real-Time Processing',
    description: 'Sub-second transaction processing with guaranteed delivery and instant settlement.',
    icon: Zap,
  },
  {
    title: 'Cryptographic Proofs',
    description: 'Every transaction secured with SHA-384 hashing and signed audit bundles.',
    icon: Shield,
  },
  {
    title: 'Global Reach',
    description: 'Multi-currency support with automatic FX and regulatory compliance.',
    icon: Globe,
  },
  {
    title: 'Advanced Analytics',
    description: 'Real-time dashboards with predictive insights and anomaly detection.',
    icon: BarChart3,
  },
  {
    title: 'Enterprise Security',
    description: 'SOC 2 Type II, PCI-DSS, and ISO 27001 certified infrastructure.',
    icon: Lock,
  },
  {
    title: 'Deterministic Replay',
    description: 'Full transaction replay capability for auditing and reconciliation.',
    icon: CheckCircle,
  },
];

const stats = [
  { value: '99.99%', label: 'Uptime SLA' },
  { value: '<100ms', label: 'Avg. Latency' },
  { value: '10M+', label: 'Daily Transactions' },
  { value: '150+', label: 'Countries Supported' },
];
