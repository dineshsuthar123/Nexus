'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  useCommandPalette,
} from '@nexus/ui';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Settings,
  CreditCard,
  BarChart3,
  Shield,
  FileText,
  Sun,
  Moon,
  LogOut,
  User,
  Keyboard,
  Bell,
  Search,
  Zap,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

// ---------------------------------------------------------------------------
// Navigation Items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
  { name: 'Transactions', href: '/dashboard/transactions', icon: ArrowLeftRight, keywords: 'transfer send history' },
  { name: 'Payments', href: '/dashboard/payments', icon: CreditCard, keywords: 'pay send money wire' },
  { name: 'Accounts', href: '/dashboard/accounts', icon: Users, keywords: 'users accounts holders' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, keywords: 'charts reports graphs' },
  { name: 'Audit Trail', href: '/dashboard/audit', icon: Shield, keywords: 'security logs compliance' },
  { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: FileText, keywords: 'reconcile match settle' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, keywords: 'preferences config' },
];

// ---------------------------------------------------------------------------
// CommandPalette Component
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  onShowShortcuts?: () => void;
  onToggleNotifications?: () => void;
}

export function CommandPalette({ onShowShortcuts, onToggleNotifications }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { open, setOpen, close } = useCommandPalette();
  const [search, setSearch] = React.useState('');

  const runCommand = React.useCallback(
    (command: () => void) => {
      close();
      command();
    },
    [close]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
        onClear={() => setSearch('')}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <Search className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p>No results found.</p>
            <p className="text-xs text-neutral-400">Try a different search term</p>
          </div>
        </CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              icon={<item.icon className="h-4 w-4" />}
              value={`${item.name} ${item.keywords}`}
              onSelect={() => runCommand(() => router.push(item.href))}
            >
              {item.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem
            icon={<CreditCard className="h-4 w-4" />}
            shortcut="⌘N"
            onSelect={() => runCommand(() => router.push('/dashboard/payments?action=new'))}
          >
            New Payment
          </CommandItem>
          <CommandItem
            icon={<RefreshCw className="h-4 w-4" />}
            onSelect={() => runCommand(() => router.push('/dashboard/reconciliation?action=run'))}
          >
            Run Reconciliation
          </CommandItem>
          <CommandItem
            icon={<Globe className="h-4 w-4" />}
            onSelect={() => runCommand(() => router.push('/dashboard/payments?action=fx'))}
          >
            FX Conversion
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Appearance & Utils */}
        <CommandGroup heading="Appearance">
          <CommandItem
            icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            onSelect={() =>
              runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))
            }
          >
            Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode
          </CommandItem>
          {onShowShortcuts && (
            <CommandItem
              icon={<Keyboard className="h-4 w-4" />}
              shortcut="?"
              onSelect={() => runCommand(onShowShortcuts)}
            >
              Keyboard Shortcuts
            </CommandItem>
          )}
          {onToggleNotifications && (
            <CommandItem
              icon={<Bell className="h-4 w-4" />}
              shortcut="⌘⇧N"
              onSelect={() => runCommand(onToggleNotifications)}
            >
              Toggle Notifications
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* Account */}
        <CommandGroup heading="Account">
          <CommandItem
            icon={<User className="h-4 w-4" />}
            onSelect={() => runCommand(() => router.push('/dashboard/settings'))}
          >
            Profile Settings
          </CommandItem>
          <CommandItem
            icon={<Zap className="h-4 w-4" />}
            onSelect={() => runCommand(() => router.push('/dashboard/settings'))}
          >
            API Keys
          </CommandItem>
          <CommandItem
            icon={<LogOut className="h-4 w-4" />}
            onSelect={() => runCommand(() => signOut({ callbackUrl: '/auth/login' }))}
          >
            Sign Out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
