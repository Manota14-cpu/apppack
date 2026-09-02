import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Casilla nativa, estilada.
 *
 * Se queda con `<input type="checkbox">` en vez de un botón con ARIA porque
 * así viaja sola en el `FormData` del formulario y el lector de pantalla ya
 * sabe leerla sin que haya que explicárselo.
 */
export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 cursor-pointer rounded border-border bg-white/[0.04] accent-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

/** Casilla con su etiqueta y, si hace falta, una línea de ayuda. */
export function CheckboxCampo({
  id,
  name,
  defaultChecked,
  checked,
  onChange,
  etiqueta,
  ayuda,
}: {
  id: string;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  etiqueta: string;
  ayuda?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-caption font-medium leading-tight">
          {etiqueta}
        </label>
        {ayuda && (
          <p id={`${id}-ayuda`} className="text-caption text-muted-foreground mt-0.5 leading-snug">
            {ayuda}
          </p>
        )}
      </div>
    </div>
  );
}
