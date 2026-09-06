import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Permite que los tests importen el código real con el alias "@/".
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Sin esto, cualquier módulo de servidor queda fuera del alcance de los
      // tests: `server-only` está pensado para el empaquetado de Next y en
      // Node lanza al importarse.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
