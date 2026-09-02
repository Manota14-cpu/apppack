import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // Permite que los tests importen el código real con el alias "@/".
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
