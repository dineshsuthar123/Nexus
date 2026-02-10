'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
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

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/25">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-white">
              Nexus RTP
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
            >
              Sign In
            </Link>
            <Button asChild className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25">
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 left-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8"
        >
          <motion.div variants={fadeInUp}>
            <Badge variant="secondary" className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              Enterprise-Grade Real-Time Payments
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl"
          >
            The Future of{' '}
            <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-emerald-400 bg-clip-text text-transparent">
              Payment Infrastructure
            </span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 sm:text-xl"
          >
            Process millions of transactions with cryptographic audit proofs, 
            deterministic replay, and enterprise-grade security. Built for the 
            modern financial ecosystem.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button size="lg" asChild className="bg-gradient-to-r from-blue-600 to-blue-500 px-8 shadow-xl shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400">
              <Link href="/dashboard">
                Open Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              <Link href="/docs">
                View Documentation
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* KPI Stats Section */}
      <section className="relative border-y border-slate-800/50 bg-slate-900/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={fadeInUp}
                className="rounded-xl bg-slate-800/30 p-6 ring-1 ring-slate-700/50"
              >
                <div className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-4xl font-bold text-transparent">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
            >
              Enterprise Features
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mt-4 text-slate-400"
            >
              Built for scale, security, and compliance
            </motion.p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card variant="default" className="h-full border-slate-800 bg-slate-900/50 transition-all hover:border-slate-700 hover:bg-slate-800/50">
                  <CardHeader>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 text-blue-400 ring-1 ring-blue-500/30">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-white">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-400">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats Section - removed duplicate, already have KPI section above */}

      {/* CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-20 text-center sm:px-12 lg:px-16"
          >
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23ffffff\" fill-opacity=\"0.05\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />
            
            <div className="relative">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Ready to transform your payment infrastructure?
              </h2>
              <p className="mt-4 text-lg text-blue-100">
                Get started with Nexus RTP Platform today.
              </p>
              <Button
                variant="secondary"
                size="lg"
                className="mt-8 bg-white px-8 text-blue-600 shadow-xl hover:bg-slate-100"
                asChild
              >
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-950 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 text-white">
                <Zap className="h-4 w-4" />
              </div>
              <span className="font-semibold text-white">
                Nexus RTP
              </span>
            </div>
            <p className="text-sm text-slate-500">
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
