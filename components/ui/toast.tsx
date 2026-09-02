"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      // 6s: con 3s no se alcanzaban a leer los mensajes de error.
      duration={6000}
      toastOptions={{
        className: "!bg-[#0d0d0d] !text-white !border !border-white/15",
      }}
    />
  );
}
