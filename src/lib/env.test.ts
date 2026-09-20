import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, assertConfigured } from "./env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

const completo = () => {
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
  process.env.SESSION_SECRET = "x".repeat(32);
  process.env.APP_URL = "https://questionon.test";
  process.env.MAIL_PROVIDER = "resend";
};

describe("assertConfigured", () => {
  it("pasa con la configuración completa", () => {
    completo();
    expect(() => assertConfigured()).not.toThrow();
  });

  it("reporta TODAS las variables que faltan de una vez", () => {
    // De una en una, arreglar la configuración serían cinco reinicios.
    process.env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    try {
      assertConfigured();
      throw new Error("debería haber fallado");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const mensaje = (err as Error).message;
      for (const clave of [
        "REDIS_URL",
        "DATABASE_URL",
        "SESSION_SECRET",
        "APP_URL",
        "MAIL_PROVIDER",
      ]) {
        expect(mensaje).toContain(clave);
      }
    }
  });

  it("rechaza un secreto de sesión demasiado corto", () => {
    completo();
    process.env.SESSION_SECRET = "corto";
    expect(() => assertConfigured()).toThrow(/al menos 32/);
  });

  it("rechaza una APP_URL que no sea una URL", () => {
    completo();
    // NODE_ENV es de solo lectura en los tipos de Next: se asigna por indice.
  (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.APP_URL = "questionon.test";
    expect(() => assertConfigured()).toThrow(/http/);
  });

  it("en desarrollo no exige APP_URL ni proveedor de correo", () => {
    // Pedirlos en local obligaría a montar un servidor de correo para tocar
    // una pantalla.
    process.env = {
      NODE_ENV: "development",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
      SESSION_SECRET: "x".repeat(32),
    } as NodeJS.ProcessEnv;
    expect(() => assertConfigured()).not.toThrow();
  });
});
