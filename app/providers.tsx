"use client";

import type { ReactNode } from "react";

/**
 * La app tiene un único tema oscuro, definido con tokens en globals.css.
 * Antes había un ThemeProvider que agregaba una clase `.light` que ninguna
 * hoja de estilo leía: 150 líneas que no hacían nada.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
