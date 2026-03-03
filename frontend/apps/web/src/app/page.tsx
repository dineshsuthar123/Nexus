'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@nexus/ui';
import { ArrowRight, Shield, Zap, Globe, BarChart3, Lock, CheckCircle } from 'lucide-react';

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.1 } },
};

const features = [
  { title: 'Real-Time Processing', description: 'Sub-second transaction processing with guaranteed delivery and zero message loss.', icon: Zap, gradient: 'from-blue-500/20 to-cyan-500/20', iconColor: 'text-blue-500', ring: 'ring-blue-500/30' },
  { title: 'Cryptographic Proofs', description: 'Every transaction secured with SHA-384 hashing and immutable audit trails.', icon: Shield, gradient: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-500', ring: 'ring-emerald-500/30' },
  { title: 'Global Reach', description: 'Multi-currency support with automatic FX across 150+ countries.', icon: Globe, gradient: 'from-violet-500/20 to-purple-500/20', iconColor: 'text-violet-500', ring: 'ring-violet-500/30' },
  { title: 'Advanced Analytics', description: 'Real-time dashboards with predictive insights and trend detection.', icon: BarChart3, gradient: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-500', ring: 'ring-amber-500/30' },
  { title: 'Enterprise Security', description: 'SOC 2 Type II, PCI-DSS certified infrastructure with mTLS.', icon: Lock, gradient: 'from-rose-500/20 to-pink-500/20', iconColor: 'text-rose-500', ring: 'ring-rose-500/30' },
  { title: 'Deterministic Replay', description: 'Full transaction replay and reconciliation for auditing.', icon: CheckCircle, gradient: 'from-sky-500/20 to-indigo-500/20', iconColor: 'text-sky-500', ring: 'ring-sky-500/30' },
];

const stats = [
  { value: '99.99%', label: 'Uptime SLA' },
  { value: '<100ms', label: 'Avg. Latency' },
  { value: '10M+', label: 'Daily Transactions' },
  { value: '150+', label: 'Countries Supported' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* ======= Header ======= */}
      <header className="sticky top-0 z-50 border-b border-neutral-200/60 bg-white/80 backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/25">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-neutral-900 dark:text-white">Nexus RTP</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
              Sign In
            </Link>
            <Button asChild className="bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40">
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ======= Hero ======= */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 left-1/4 h-96 w-96 rounded-full bg-blue-500/8 blur-3xl dark:bg-blue-500/10" />
          <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-emerald-500/8 blur-3xl dark:bg-emerald-500/10" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-500/5 blur-3xl dark:bg-amber-500/8" />
        </div>

        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8"
        >
          <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="mb-6 border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              Enterprise-Grade Real-Time Payments
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-5xl lg:text-6xl xl:text-7xl"
          >
            The Future of{' '}
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500 bg-clip-text text-transparent dark:from-blue-400 dark:via-blue-300 dark:to-emerald-400">
              Payment Infrastructure
            </span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 dark:text-slate-400 sm:text-xl"
          >
            Process millions of transactions with cryptographic audit proofs, deterministic replay, and enterprise-grade security.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button size="lg" asChild className="bg-gradient-to-r from-blue-600 to-blue-500 px-8 text-white shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40">
              <Link href="/dashboard">
                Open Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Link href="/docs">View Documentation</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ======= Stats ======= */}
      <section className="relative border-y border-neutral-200/60 bg-neutral-50/80 py-16 dark:border-slate-800/50 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid gap-6 text-center sm:grid-cols-2 lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={fadeInUp}
                className="group rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 dark:border-slate-700/50 dark:bg-slate-800/30 dark:ring-1 dark:ring-slate-700/50"
              >
                <div className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-4xl font-bold tabular-nums text-transparent dark:from-blue-400 dark:to-emerald-400">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm font-medium text-neutral-500 dark:text-slate-400">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ======= Features ======= */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
              Enterprise Features
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-slate-400">Built for scale, security, and compliance</p>
          </div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card className="h-full border-neutral-200/60 bg-white transition-all duration-300 hover:border-neutral-300 hover:shadow-lg hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-800/50">
                  <CardHeader>
                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} ${feature.iconColor} ring-1 ${feature.ring}`}>
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-neutral-900 dark:text-white">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-neutral-600 dark:text-slate-400">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ======= CTA ======= */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-20 text-center shadow-2xl shadow-blue-500/20 sm:px-12 lg:px-16">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />
            <div className="relative">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Ready to transform your payment infrastructure?
              </h2>
              <p className="mt-4 text-lg text-blue-100">Get started with Nexus RTP Platform today.</p>
              <Button variant="secondary" size="lg" className="mt-8 bg-white px-8 text-blue-600 shadow-xl hover:bg-neutral-50" asChild>
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ======= Footer ======= */}
      <footer className="border-t border-neutral-200/60 bg-neutral-50 py-12 dark:border-slate-800/50 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 text-white">
                <Zap className="h-4 w-4" />
              </div>
              <span className="font-semibold text-neutral-900 dark:text-white">Nexus RTP</span>
            </div>
            <p className="text-sm text-neutral-500 dark:text-slate-500">
              &copy; {new Date().getFullYear()} Nexus RTP Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
