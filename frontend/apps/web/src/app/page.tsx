'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@nexus/ui';
import { ArrowRight, Shield, Zap, Globe, BarChart3, Lock, CheckCircle } from 'lucide-react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.1 } },
};

const features = [
  { title: 'Real-Time Processing', description: 'Sub-second transaction processing with guaranteed delivery.', icon: Zap },
  { title: 'Cryptographic Proofs', description: 'Every transaction secured with SHA-384 hashing.', icon: Shield },
  { title: 'Global Reach', description: 'Multi-currency support with automatic FX.', icon: Globe },
  { title: 'Advanced Analytics', description: 'Real-time dashboards with predictive insights.', icon: BarChart3 },
  { title: 'Enterprise Security', description: 'SOC 2 Type II, PCI-DSS certified infrastructure.', icon: Lock },
  { title: 'Deterministic Replay', description: 'Full transaction replay for auditing.', icon: CheckCircle },
];

const stats = [
  { value: '99.99%', label: 'Uptime SLA' },
  { value: '<100ms', label: 'Avg. Latency' },
  { value: '10M+', label: 'Daily Transactions' },
  { value: '150+', label: 'Countries Supported' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/25">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-white">Nexus RTP</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/auth/login" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
              Sign In
            </Link>
            <Button asChild className="bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-500/25">
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden py-24 sm:py-32">
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
          <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              Enterprise-Grade Real-Time Payments
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl"
          >
            The Future of{' '}
            <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-emerald-400 bg-clip-text text-transparent">
              Payment Infrastructure
            </span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 sm:text-xl"
          >
            Process millions of transactions with cryptographic audit proofs, deterministic replay, and enterprise-grade security.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button size="lg" asChild className="bg-gradient-to-r from-blue-600 to-blue-500 px-8 shadow-xl shadow-blue-500/25">
              <Link href="/dashboard">
                Open Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <Link href="/docs">View Documentation</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      <section className="relative border-y border-slate-800/50 bg-slate-900/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-slate-800/30 p-6 ring-1 ring-slate-700/50">
                <div className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-4xl font-bold text-transparent">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Enterprise Features</h2>
            <p className="mt-4 text-slate-400">Built for scale, security, and compliance</p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="h-full border-slate-800 bg-slate-900/50 transition-all hover:border-slate-700 hover:bg-slate-800/50">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 text-blue-400 ring-1 ring-blue-500/30">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-400">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-20 text-center sm:px-12 lg:px-16">
            <div className="relative">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Ready to transform your payment infrastructure?
              </h2>
              <p className="mt-4 text-lg text-blue-100">Get started with Nexus RTP Platform today.</p>
              <Button variant="secondary" size="lg" className="mt-8 bg-white px-8 text-blue-600 shadow-xl hover:bg-slate-100" asChild>
                <Link href="/dashboard">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 bg-slate-950 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 text-white">
                <Zap className="h-4 w-4" />
              </div>
              <span className="font-semibold text-white">Nexus RTP</span>
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
