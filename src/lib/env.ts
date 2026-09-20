import { logger } from "./logger";

/**
 * Comprobación de configuración al arrancar.
 *
 * Fallar aquí es incomparablemente mejor que fallar en la primera petición con
 * treinta alumnos esperando. Cada variable que falte se reporta de golpe, no de
 * una en una: así se arregla todo en un intento en lugar de descubrirlas por
 * turnos.
 */

type Requisito = {
  nombre: string;
  descripcion: string;
  /** Solo se exige en producción. */
  soloProduccion?: boolean;
  valida?: (valor: string) => string | null;
};

const REQUISITOS: Requisito[] = [
  {
    nombre: "REDIS_URL",
    descripcion: "Redis es la fuente de verdad de las partidas en curso.",
  },
  {
    nombre: "DATABASE_URL",
    descripcion: "Postgres guarda cuentas, cuestionarios y resultados.",
  },
  {
    nombre: "SESSION_SECRET",
    descripcion: "Firma las cookies de sesión y los tokens de jugador.",
    valida: (valor) =>
      valor.length < 32
        ? "debe tener al menos 32 caracteres (genérala con: openssl rand -base64 32)"
        : null,
  },
  {
    nombre: "APP_URL",
    descripcion:
      "URL pública. Sin ella los enlaces de acceso apuntarían a la dirección interna del servidor.",
    soloProduccion: true,
    valida: (valor) =>
      /^https?:\/\//.test(valor) ? null : "debe empezar por http:// o https://",
  },
  {
    nombre: "MAIL_PROVIDER",
    descripcion:
      "Sin proveedor de correo los enlaces de acceso se volcarían al log en vez de enviarse.",
    soloProduccion: true,
  },
];

export class ConfigError extends Error {
  constructor(problemas: string[]) {
    super(
      `Configuración incompleta:\n\n${problemas.map((p) => `  · ${p}`).join("\n")}\n\n` +
        `Revisa .env.example para ver qué hace falta.`,
    );
    this.name = "ConfigError";
  }
}

export function assertConfigured() {
  const produccion = process.env.NODE_ENV === "production";
  const problemas: string[] = [];

  for (const requisito of REQUISITOS) {
    if (requisito.soloProduccion && !produccion) continue;

    const valor = process.env[requisito.nombre]?.trim();
    if (!valor) {
      problemas.push(`${requisito.nombre} no está definida. ${requisito.descripcion}`);
      continue;
    }

    const error = requisito.valida?.(valor);
    if (error) problemas.push(`${requisito.nombre} ${error}`);
  }

  if (problemas.length > 0) throw new ConfigError(problemas);

  logger.info(
    { produccion, cobro: Boolean(process.env.STRIPE_SECRET_KEY?.trim()) },
    "configuración comprobada",
  );
}
