import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Modal/Dialog Component
 *
 * An accessible modal dialog built on Radix UI Dialog primitive.
 * Handles focus trapping, keyboard navigation, and screen reader announcements.
 *
 * @example
 * <Modal open={isOpen} onOpenChange={setIsOpen}>
 *   <ModalContent>
 *     <ModalHeader>
 *       <ModalTitle>Confirm Payment</ModalTitle>
 *       <ModalDescription>
 *         Are you sure you want to send $1,000 to John Doe?
 *       </ModalDescription>
 *     </ModalHeader>
 *     <ModalFooter>
 *       <Button variant="outline" onClick={handleCancel}>Cancel</Button>
 *       <Button onClick={handleConfirm}>Confirm</Button>
 *     </ModalFooter>
 *   </ModalContent>
 * </Modal>
 */

const Modal = DialogPrimitive.Root;

const ModalTrigger = DialogPrimitive.Trigger;

const ModalPortal = DialogPrimitive.Portal;

const ModalClose = DialogPrimitive.Close;

/**
 * Modal overlay - the backdrop behind the modal content
 */
const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-overlay bg-neutral-900/50 backdrop-blur-sm',
      'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      className
    )}
    {...props}
  />
));
ModalOverlay.displayName = 'ModalOverlay';

/**
 * Modal content container
 */
interface ModalContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Whether to show the close button in the top-right corner.
   * @default true
   */
  showCloseButton?: boolean;
  /**
   * Size of the modal.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(({ className, children, showCloseButton = true, size = 'md', ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-modal translate-x-[-50%] translate-y-[-50%]',
        'w-full p-6',
        modalSizes[size],
        'bg-card text-card-foreground rounded-lg shadow-2xl',
        'border border-border',
        'data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out',
        'focus:outline-none',
        // Reduced motion support
        'motion-reduce:animate-none',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4',
            'rounded-sm opacity-70 ring-offset-background',
            'transition-opacity hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none',
            // Minimum touch target
            'p-1 -m-1'
          )}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </ModalPortal>
));
ModalContent.displayName = 'ModalContent';

/**
 * Modal header - contains title and optional description
 */
const ModalHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
));
ModalHeader.displayName = 'ModalHeader';

/**
 * Modal footer - contains action buttons
 */
const ModalFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      'mt-6 gap-2 sm:gap-0',
      className
    )}
    {...props}
  />
));
ModalFooter.displayName = 'ModalFooter';

/**
 * Modal title - the main heading of the modal
 */
const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
ModalTitle.displayName = 'ModalTitle';

/**
 * Modal description - supporting text below the title
 */
const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
ModalDescription.displayName = 'ModalDescription';

export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  type ModalContentProps,
};
