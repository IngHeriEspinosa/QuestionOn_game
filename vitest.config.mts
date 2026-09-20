import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Solo el dominio puro y los validadores. Los tests de integración contra
    // Redis y Postgres viven en tests/integration y se lanzan aparte.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // `server-only` lanza a propósito cuando se importa fuera de un Server
      // Component, y Vitest lo es. Se apunta al fichero vacío que el propio
      // paquete trae (por ruta directa: su campo `exports` no publica el
      // subpath). La protección sigue activa en la aplicación real, que es
      // donde importa.
      "server-only": path.resolve("node_modules/server-only/empty.js"),
    },
  },
});
