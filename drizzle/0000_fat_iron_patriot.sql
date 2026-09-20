CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid,
	"org_id" uuid,
	"host_user_id" uuid,
	"join_code" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"player_count" integer DEFAULT 0 NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quiz_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"choices" text[] NOT NULL,
	"correct" smallint[] NOT NULL,
	"correct_numeric" numeric,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"media" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'es' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"default_question_time_ms" integer DEFAULT 20000 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_answers" (
	"session_id" uuid NOT NULL,
	"session_player_id" uuid NOT NULL,
	"question_index" smallint NOT NULL,
	"question_id" uuid,
	"selected" smallint[] DEFAULT '{}' NOT NULL,
	"numeric_answer" numeric,
	"is_correct" boolean NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"points_earned" integer NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_answers_session_id_session_player_id_question_index_pk" PRIMARY KEY("session_id","session_player_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "session_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"player_key" uuid NOT NULL,
	"display_name" text NOT NULL,
	"user_id" uuid,
	"final_score" integer DEFAULT 0 NOT NULL,
	"final_rank" integer,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_question_stats" (
	"session_id" uuid NOT NULL,
	"question_index" smallint NOT NULL,
	"question_id" uuid,
	"prompt" text NOT NULL,
	"answered_count" integer NOT NULL,
	"correct_count" integer NOT NULL,
	"avg_elapsed_ms" integer NOT NULL,
	"choice_distribution" jsonb NOT NULL,
	CONSTRAINT "session_question_stats_session_id_question_index_pk" PRIMARY KEY("session_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"role" text DEFAULT 'teacher' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_answers" ADD CONSTRAINT "session_answers_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_answers" ADD CONSTRAINT "session_answers_session_player_id_session_players_id_fk" FOREIGN KEY ("session_player_id") REFERENCES "public"."session_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question_stats" ADD CONSTRAINT "session_question_stats_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gs_host_idx" ON "game_sessions" USING btree ("host_user_id","started_at");--> statement-breakpoint
CREATE INDEX "gs_org_idx" ON "game_sessions" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "gs_quiz_idx" ON "game_sessions" USING btree ("quiz_id","started_at");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_idx" ON "quiz_questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quizzes_owner_idx" ON "quizzes" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "quizzes_org_idx" ON "quizzes" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "sa_session_question_idx" ON "session_answers" USING btree ("session_id","question_index");--> statement-breakpoint
CREATE UNIQUE INDEX "sp_session_player_idx" ON "session_players" USING btree ("session_id","player_key");--> statement-breakpoint
CREATE INDEX "sp_session_rank_idx" ON "session_players" USING btree ("session_id","final_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");