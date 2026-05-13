'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../utils';

type Side = 'top' | 'right' | 'bottom' | 'left';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      'bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: Side;
  showCloseButton?: boolean;
  portalProps?: Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>, 'children'>;
}

const SHEET_CONTENT_BASE_CLASSES =
  'bg-popover text-popover-foreground fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out';

const SHEET_CONTENT_SIDE_CLASSES =
  // positioning per side
  'data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t ' +
  'data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r ' +
  'data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l ' +
  'data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b ' +
  'data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm';

// Radix exposes `data-state="open"|"closed"` (rather than bits-ui's flat `data-open`/`data-closed`),
// so the React port keys animation utilities on `data-[state=open]:` / `data-[state=closed]:`.
const SHEET_CONTENT_ANIMATION_CLASSES =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 ' +
  'data-[side=bottom]:data-[state=open]:slide-in-from-bottom-10 ' +
  'data-[side=left]:data-[state=open]:slide-in-from-left-10 ' +
  'data-[side=right]:data-[state=open]:slide-in-from-right-10 ' +
  'data-[side=top]:data-[state=open]:slide-in-from-top-10 ' +
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 ' +
  'data-[side=bottom]:data-[state=closed]:slide-out-to-bottom-10 ' +
  'data-[side=left]:data-[state=closed]:slide-out-to-left-10 ' +
  'data-[side=right]:data-[state=closed]:slide-out-to-right-10 ' +
  'data-[side=top]:data-[state=closed]:slide-out-to-top-10';

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    { className, side = 'right', showCloseButton = true, portalProps, children, ...props },
    ref,
  ) => (
    <SheetPortal {...portalProps}>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          SHEET_CONTENT_BASE_CLASSES,
          SHEET_CONTENT_SIDE_CLASSES,
          SHEET_CONTENT_ANIMATION_CLASSES,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = 'SheetContent';

export const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-header"
    className={cn('gap-0.5 p-4 flex flex-col', className)}
    {...props}
  />
));
SheetHeader.displayName = 'SheetHeader';

export const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sheet-footer"
    className={cn('gap-2 p-4 mt-auto flex flex-col', className)}
    {...props}
  />
));
SheetFooter.displayName = 'SheetFooter';

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn('text-foreground text-base font-medium', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export type { Side };
