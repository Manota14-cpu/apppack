import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Placeholder con token propio: antes usaba /40 (1.77:1), muy por debajo de AA. */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl border border-border bg-white/[0.04] px-4 py-2 text-body text-foreground",
          "placeholder:text-placeholder",
          "focus-visible:border-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
          "disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
          className
        )}
        {...props}
      />
    );
  }
);
