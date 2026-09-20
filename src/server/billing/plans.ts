/**
 * Planes y sus límites.
 *
 * Fuente única de verdad: ni las rutas ni la interfaz codifican números por su
 * cuenta. Un límite que aparece en dos sitios acaba divergiendo, y el día que
 * diverge el cliente ve un precio y recibe otro producto.
 *
 * Sin dependencias de Stripe a propósito: esto describe el PRODUCTO, no cómo se
 * cobra. Cambiar de pasarela no debe tocar este fichero.
 */

export const PLAN_IDS = ["free", "pro", "school"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Jugadores por sala. El eje de valor que mejor convierte. */
  maxPlayersPerGame: number;
  /** Cuestionarios guardados. `Infinity` para ilimitados. */
  maxSavedQuizzes: number;
  /** Días que se conservan los informes. */
  reportRetentionDays: number;
  /** Tipos de pregunta disponibles. */
  questionTypes: readonly string[];
  /** Exportar resultados a CSV/Excel. */
  canExportReports: boolean;
  /** Subir imágenes propias en vez de enlazar una URL. */
  canUploadMedia: boolean;
  /** Logo y colores en la pantalla proyectada. */
  canBrand: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  /** Precio mensual en céntimos, facturado anualmente. Null si es gratis. */
  monthlyPriceCents: number | null;
  limits: PlanLimits;
};

const ALL_TYPES = ["single", "multi", "boolean", "numeric", "order"] as const;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Gratis",
    monthlyPriceCents: null,
    limits: {
      // Un aula de 25 cabe; una charla o un torneo entre clases, no. Ese es
      // justo el punto donde tiene sentido pagar.
      maxPlayersPerGame: 25,
      maxSavedQuizzes: 5,
      reportRetentionDays: 7,
      questionTypes: ["single", "boolean"],
      canExportReports: false,
      canUploadMedia: false,
      canBrand: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro docente",
    monthlyPriceCents: 700,
    limits: {
      maxPlayersPerGame: 200,
      maxSavedQuizzes: Number.POSITIVE_INFINITY,
      reportRetentionDays: 3650,
      questionTypes: ALL_TYPES,
      canExportReports: true,
      canUploadMedia: true,
      canBrand: true,
    },
  },
  school: {
    id: "school",
    name: "Centro",
    monthlyPriceCents: 500,
    limits: {
      maxPlayersPerGame: 300,
      maxSavedQuizzes: Number.POSITIVE_INFINITY,
      reportRetentionDays: 3650,
      questionTypes: ALL_TYPES,
      canExportReports: true,
      canUploadMedia: true,
      canBrand: true,
    },
  },
};

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Plan a partir de lo guardado en la base.
 *
 * Ante un valor desconocido se cae a `free`, nunca a uno de pago: un dato
 * corrupto no debe regalar funciones premium.
 */
export function planFor(rawPlan: string | null | undefined): Plan {
  if (rawPlan && isPlanId(rawPlan)) return PLANS[rawPlan];
  return PLANS.free;
}

export function limitsFor(rawPlan: string | null | undefined): PlanLimits {
  return planFor(rawPlan).limits;
}
