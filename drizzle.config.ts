import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://questionon:questionon@127.0.0.1:5432/questionon",
  },
  // SQL plano, ejecutable desde el entrypoint del contenedor sin CLI extra.
  verbose: true,
  strict: true,
});
