import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        secondary: "bg-white/[0.09] text-foreground hover:bg-white/[0.14]",
        // Antes era text-white/45 → 4.41:1, por debajo de AA. Ahora usa el token.
        ghost: "text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
        outline: "border border-border bg-transparent text-foreground hover:bg-white/[0.05] hover:border-white/25",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 px-3 py-1.5",
        lg: "h-12 px-8 text-body",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});

export { buttonVariants };
