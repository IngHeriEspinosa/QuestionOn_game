import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema de lo duradero.
 *
 * Frontera con Redis, que conviene no cruzar:
 * - Redis guarda la partida EN CURSO. Vida de horas, cientos de escrituras por
 *   segundo, y si se pierde se pierde una clase.
 * - Postgres guarda lo que importa para siempre: cuentas, quizzes y resultados.
 *   Se escribe al crear la sala y al archivar, nunca durante el juego.
 *
 * Regla dura: Postgres jamas esta en el camino critico de una partida en vivo.
 */

// ---------------------------------------------------------------- cuentas

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name"),
    // Null cuando la cuenta solo usa enlace magico u OAuth.
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("teacher"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    // Indice funcional sobre lower(email): sin el, "Ana@colegio.es" y
    // "ana@colegio.es" serian dos cuentas distintas, que es como se cuelan los
    // duplicados y los secuestros de cuenta por diferencia de mayusculas.
    // La aplicacion ademas normaliza el correo antes de escribir.
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    index("users_org_idx").on(t.orgId),
  ],
);

/**
 * Tokens de un solo uso para el acceso por enlace magico.
 *
 * Se guarda el hash, no el token: si alguien lee la tabla no puede entrar con
 * lo que ve, igual que con una contraseña.
 */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_tokens_email_idx").on(t.email, t.createdAt)],
);

// ----------------------------------------------------------------- quizzes

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    language: text("language").notNull().default("es"),
    visibility: text("visibility").notNull().default("private"),
    defaultQuestionTimeMs: integer("default_question_time_ms").notNull().default(20000),
    // speedBonus, streakBonus, shuffleChoices.
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Borrado logico: un quiz borrado no debe romper los informes historicos.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("quizzes_owner_idx").on(t.ownerId, t.updatedAt),
    index("quizzes_org_idx").on(t.orgId, t.updatedAt),
  ],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    prompt: text("prompt").notNull(),
    choices: text("choices").array().notNull(),
    // Indices de `choices`. En las de tipo `order`, la posicion importa.
    correct: smallint("correct").array().notNull(),
    correctNumeric: numeric("correct_numeric"),
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1"),
    media: jsonb("media"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quiz_questions_quiz_idx").on(t.quizId, t.position)],
);

// ------------------------------------------------------------ partidas jugadas

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    hostUserId: uuid("host_user_id").references(() => users.id, { onDelete: "set null" }),
    // Historico. La unicidad del codigo VIVO la garantiza Redis con SET NX.
    joinCode: text("join_code").notNull(),
    status: text("status").notNull().default("live"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    playerCount: integer("player_count").notNull().default(0),
    questionCount: integer("question_count").notNull().default(0),
    settings: jsonb("settings").notNull().default({}),
    /**
     * El quiz TAL Y COMO SE JUGO. No es opcional.
     *
     * Sin esto, si el docente edita el quiz despues, todos los informes
     * historicos mienten: dirian que el grupo fallo una pregunta que en
     * realidad nunca se les hizo. Es la diferencia entre un informe y una
     * ficcion.
     */
    quizSnapshot: jsonb("quiz_snapshot").notNull(),
  },
  (t) => [
    index("gs_host_idx").on(t.hostUserId, t.startedAt),
    index("gs_org_idx").on(t.orgId, t.startedAt),
    index("gs_quiz_idx").on(t.quizId, t.startedAt),
  ],
);

export const sessionPlayers = pgTable(
  "session_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    // El playerId que uso el cliente durante la partida.
    playerKey: uuid("player_key").notNull(),
    displayName: text("display_name").notNull(),
    // Null mientras los alumnos no tengan cuenta, que es la decision actual.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    finalScore: integer("final_score").notNull().default(0),
    finalRank: integer("final_rank"),
    correctCount: integer("correct_count").notNull().default(0),
    answeredCount: integer("answered_count").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("sp_session_player_idx").on(t.sessionId, t.playerKey),
    index("sp_session_rank_idx").on(t.sessionId, t.finalRank),
  ],
);

export const sessionAnswers = pgTable(
  "session_answers",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    sessionPlayerId: uuid("session_player_id")
      .notNull()
      .references(() => sessionPlayers.id, { onDelete: "cascade" }),
    questionIndex: smallint("question_index").notNull(),
    // Del snapshot: puede que ya no exista en quiz_questions.
    questionId: uuid("question_id"),
    selected: smallint("selected").array().notNull().default([]),
    numericAnswer: numeric("numeric_answer"),
    isCorrect: boolean("is_correct").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    pointsEarned: integer("points_earned").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Clave natural: da idempotencia gratis al archivar. Reprocesar el mismo
    // job de la cola no puede duplicar filas.
    primaryKey({ columns: [t.sessionId, t.sessionPlayerId, t.questionIndex] }),
    index("sa_session_question_idx").on(t.sessionId, t.questionIndex),
  ],
);

/**
 * Agregados por pregunta, calculados al archivar.
 *
 * Evita que el informe del docente haga un GROUP BY sobre session_answers cada
 * vez que se abre. Salen gratis en el momento del archivado, cuando los datos
 * ya estan en memoria.
 */
export const sessionQuestionStats = pgTable(
  "session_question_stats",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    questionIndex: smallint("question_index").notNull(),
    questionId: uuid("question_id"),
    prompt: text("prompt").notNull(),
    answeredCount: integer("answered_count").notNull(),
    correctCount: integer("correct_count").notNull(),
    avgElapsedMs: integer("avg_elapsed_ms").notNull(),
    // {"0": 12, "1": 40, "2": 3, "3": 5}
    choiceDistribution: jsonb("choice_distribution").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.questionIndex] })],
);

// ------------------------------------------------------------------ billing

/**
 * Suscripcion activa de una organizacion o de un docente.
 *
 * La aplicacion NUNCA consulta a Stripe en la ruta caliente: los permisos se
 * leen de aqui, y los webhooks mantienen esta tabla al dia. Una llamada a la
 * pasarela por peticion seria lenta y convertiria una caida de Stripe en una
 * caida del producto.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Una de las dos: suscripcion de centro (org) o de docente suelto (user).
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("inactive"),
    /** Identificadores del proveedor. `provider` permite cambiar de pasarela. */
    provider: text("provider").notNull().default("stripe"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    /** Asientos contratados, para el plan de centro. */
    seats: integer("seats").notNull().default(1),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_user_idx").on(t.userId),
    uniqueIndex("subscriptions_org_idx").on(t.orgId),
    index("subscriptions_provider_sub_idx").on(t.providerSubscriptionId),
  ],
);

/**
 * Eventos de webhook ya procesados.
 *
 * Stripe reenvia eventos, y procesar dos veces un `subscription.updated`
 * corromperia el estado del plan. La clave primaria es el id del evento.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
