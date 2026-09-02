import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[76px] w-full resize-y rounded-xl border border-border bg-white/[0.04] px-4 py-2.5 text-body text-foreground",
        "placeholder:text-placeholder",
        "focus-visible:border-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
        "disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
        className
      )}
      {...props}
    />
  );
}
