"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "glass-strong fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border p-6 shadow-card data-[state=open]:animate-scale-in",
          className
        )}
        {...props}
      >
        {children}
        {/* 40x40: antes era p-1 (~24px), por debajo del mínimo táctil recomendado. */}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-5 space-y-1.5 pr-10", className)} {...props} />
);

export function DialogTitle({ className, ...props }: DialogPrimitive.DialogTitleProps) {
  return <DialogPrimitive.Title className={cn("text-section text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.DialogDescriptionProps) {
  return <DialogPrimitive.Description className={cn("text-caption text-muted-foreground", className)} {...props} />;
}
