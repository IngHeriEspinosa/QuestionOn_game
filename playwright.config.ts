import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    // Espanol por defecto: es el mercado principal y lo que esperan casi todos
    // los tests. Los que comprueban la deteccion de idioma crean su propio
    // contexto con otro locale.
    locale: "es-ES",
  },
});
