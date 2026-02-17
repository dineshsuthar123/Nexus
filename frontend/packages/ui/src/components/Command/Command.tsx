'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal, ModalContent } from '../Modal';

/* -----------------------------------------------------------------------------
 * Command Root
 * -------------------------------------------------------------------------- */

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-neutral-950 dark:bg-neutral-900 dark:text-neutral-50',
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

/* -----------------------------------------------------------------------------
 * Command Dialog (⌘K modal)
 * -------------------------------------------------------------------------- */

export interface CommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const CommandDialog: React.FC<CommandDialogProps> = ({
  open,
  onOpenChange,
  children,
}) => {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-500 dark:[&_[cmdk-group-heading]]:text-neutral-400 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </ModalContent>
    </Modal>
  );
};
CommandDialog.displayName = 'CommandDialog';

/* -----------------------------------------------------------------------------
 * Command Input
 * -------------------------------------------------------------------------- */

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
    onClear?: () => void;
  }
>(({ className, onClear, ...props }, ref) => (
  <div className="flex items-center border-b border-neutral-200 px-3 dark:border-neutral-700" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none',
        'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
    {onClear && (
      <button
        type="button"
        onClick={onClear}
        className="ml-2 rounded-sm opacity-50 ring-offset-background hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Clear</span>
      </button>
    )}
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

/* -----------------------------------------------------------------------------
 * Command List
 * -------------------------------------------------------------------------- */

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

/* -----------------------------------------------------------------------------
 * Command Empty
 * -------------------------------------------------------------------------- */

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

/* -----------------------------------------------------------------------------
 * Command Group
 * -------------------------------------------------------------------------- */

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-neutral-950 dark:text-neutral-50',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-500 dark:[&_[cmdk-group-heading]]:text-neutral-400',
      className
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

/* -----------------------------------------------------------------------------
 * Command Separator
 * -------------------------------------------------------------------------- */

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-neutral-200 dark:bg-neutral-700', className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

/* -----------------------------------------------------------------------------
 * Command Item
 * -------------------------------------------------------------------------- */

export interface CommandItemProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> {
  /** Icon to display */
  icon?: React.ReactNode;
  /** Keyboard shortcut */
  shortcut?: string;
}

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, icon, shortcut, children, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
      'data-[selected=true]:bg-neutral-100 data-[selected=true]:text-neutral-900',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      'dark:data-[selected=true]:bg-neutral-800 dark:data-[selected=true]:text-neutral-50',
      className
    )}
    {...props}
  >
    {icon && <span className="mr-2 h-4 w-4 shrink-0" aria-hidden="true">{icon}</span>}
    <span className="flex-1">{children}</span>
    {shortcut && (
      <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border border-neutral-200 bg-neutral-100 px-1.5 font-mono text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
        {shortcut}
      </kbd>
    )}
  </CommandPrimitive.Item>
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

/* -----------------------------------------------------------------------------
 * Command Shortcut
 * -------------------------------------------------------------------------- */

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'ml-auto text-xs tracking-widest text-neutral-500 dark:text-neutral-400',
      className
    )}
    {...props}
  />
);
CommandShortcut.displayName = 'CommandShortcut';

/* -----------------------------------------------------------------------------
 * useCommandPalette Hook
 * -------------------------------------------------------------------------- */

export function useCommandPalette(defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
  };
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
