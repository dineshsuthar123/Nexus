'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Settings,
  CreditCard,
  BarChart3,
  Shield,
  FileText,
  Menu,
  X,
  ChevronDown,
  Zap,
  LogOut,
  User,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  Search,
  Building2,
  ChevronRight,
  WifiOff,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSession, signOut } from 'next-auth/react';
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SimpleBreadcrumb,
  type BreadcrumbItemData,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  cn,
} from '@nexus/ui';
import { useWebSocketContext } from '../websocket-provider';
import { CommandPalette } from '@/components/CommandPalette';
import { Toaster } from '@/components/Toaster';
import { KeyboardShortcuts, useKeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { NotificationPopover } from '@/components/NotificationPopover';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/dashboard/transactions', icon: ArrowLeftRight },
  { name: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { name: 'Accounts', href: '/dashboard/accounts', icon: Users },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Audit Trail', href: '/dashboard/audit', icon: Shield },
  { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: FileText },
];

const secondaryNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const { data: session } = useSession();
  const { isConnected } = useWebSocketContext();
  const user = session?.user;
  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email ?? 'User';
  const userEmail = user?.email ?? '';
  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() ?? 'U';
  const userRole = (user as any)?.role ?? 'Administrator';

  // Notification center state
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  // Keyboard shortcuts dialog state
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  // Register global keyboard shortcuts
  useKeyboardShortcuts({
    onToggleSidebar: () => setCollapsed((c) => !c),
    onToggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    onToggleNotifications: () => setNotificationsOpen((o) => !o),
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Breadcrumb from pathname
  const breadcrumbItems: BreadcrumbItemData[] = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
      href: index < segments.length - 1
        ? '/' + segments.slice(0, index + 1).join('/')
        : undefined,
    }));
  }, [pathname]);

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-64';
  const mainPadding = collapsed ? 'lg:pl-[72px]' : 'lg:pl-64';

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out lg:translate-x-0',
            'glass-sidebar',
            sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full',
            `lg:${sidebarWidth}`
          )}
          style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? (collapsed ? '72px' : '256px') : undefined }}
        >
          <div className="flex h-full flex-col">
            {/* Logo + Collapse Toggle */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-neutral-200/50 dark:border-neutral-800/50">
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-lg shadow-primary-500/20">
                  <Zap className="h-5 w-5" />
                </div>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-lg font-bold text-neutral-900 dark:text-neutral-50"
                  >
                    Nexus RTP
                  </motion.span>
                )}
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="hidden rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 lg:block"
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Org Switcher */}
            {!collapsed && (
              <div className="px-3 pt-3">
                <button className="flex w-full items-center gap-2.5 rounded-lg border border-neutral-200/60 bg-neutral-50/50 px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:border-neutral-700/40 dark:bg-neutral-800/30 dark:hover:bg-neutral-800/60">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900">
                    <Building2 className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">Nexus Corp</p>
                    <p className="truncate text-[11px] text-neutral-500">Production</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                </button>
              </div>
            )}

            {/* Search (expanded mode only) — opens Command Palette */}
            {!collapsed && (
              <div className="px-3 pt-3">
                <button
                  onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                  className="flex w-full items-center gap-2 rounded-lg border border-neutral-200/60 bg-neutral-50/50 px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-100 dark:border-neutral-700/40 dark:bg-neutral-800/30 dark:hover:bg-neutral-800/60"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search...</span>
                  <kbd className="ml-auto rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
                    ⌘K
                  </kbd>
                </button>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto scrollbar-thin">
              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  Main
                </p>
              )}
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                const linkContent = (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-primary-50 text-primary-700 shadow-sm shadow-primary-500/5 dark:bg-primary-950/60 dark:text-primary-300 nav-active-indicator'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary-600 dark:text-primary-400')} />
                    {!collapsed && <span>{item.name}</span>}
                    {!collapsed && isActive && (
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary-400" />
                    )}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}

              {/* Divider */}
              <div className="!my-4 border-t border-neutral-200/60 dark:border-neutral-800/60" />

              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  System
                </p>
              )}
              {secondaryNavigation.map((item) => {
                const isActive = pathname === item.href;
                const linkContent = (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 nav-active-indicator'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </nav>

            {/* User Profile Section at Bottom */}
            <div className="border-t border-neutral-200/50 p-3 dark:border-neutral-800/50">
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex w-full items-center justify-center rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      <Avatar size="sm">
                        <AvatarFallback className="bg-gradient-to-br from-primary-400 to-secondary-400 text-white text-xs">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <div>
                      <p className="font-medium">{userName}</p>
                      <p className="text-xs text-neutral-400">{userRole}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60">
                      <Avatar size="sm">
                        <AvatarFallback className="bg-gradient-to-br from-primary-400 to-secondary-400 text-white text-xs">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {userName}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500">{userRole}</p>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="font-medium">{userName}</span>
                        <span className="text-xs text-neutral-500">{userEmail}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<User className="h-4 w-4" />}>
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Settings className="h-4 w-4" />}>
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      icon={<LogOut className="h-4 w-4" />}
                      destructive
                      onClick={() => signOut({ callbackUrl: '/auth/login' })}
                    >
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className={cn('transition-all duration-300', mainPadding)}>
          {/* Top header */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200/60 bg-white/80 px-4 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/80 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 lg:hidden dark:hover:bg-neutral-800"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Breadcrumb */}
              <SimpleBreadcrumb
                items={breadcrumbItems}
                homeIcon
                className="hidden sm:block"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Connection Status */}
              <div className={cn(
                'hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                isConnected
                  ? 'bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-400'
                  : 'bg-danger-50 text-danger-700 dark:bg-danger-950 dark:text-danger-400'
              )}>
                {isConnected ? (
                  <>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success-500" />
                    </span>
                    Live
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    Offline
                  </>
                )}
              </div>

              {/* Theme toggle */}
              {mounted && (
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </button>
              )}

              {/* Notifications */}
              <NotificationPopover
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
              />

              {/* User menu (header - compact) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Avatar size="sm">
                      <AvatarFallback className="bg-gradient-to-br from-primary-400 to-secondary-400 text-white text-xs">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="font-medium">{userName}</span>
                      <span className="text-xs text-neutral-500">{userEmail}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<User className="h-4 w-4" />}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={<Settings className="h-4 w-4" />}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={<LogOut className="h-4 w-4" />}
                    destructive
                    onClick={() => signOut({ callbackUrl: '/auth/login' })}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content with enter animation */}
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
            className="p-4 sm:p-6 lg:p-8"
          >
            {children}
          </motion.main>
        </div>
      </div>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        onShowShortcuts={() => setShortcutsOpen(true)}
        onToggleNotifications={() => setNotificationsOpen((o) => !o)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Toast Notifications */}
      <Toaster />
    </TooltipProvider>
  );
}
