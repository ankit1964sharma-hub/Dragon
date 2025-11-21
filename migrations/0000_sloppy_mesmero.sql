CREATE TABLE "bot_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_event_active" boolean DEFAULT true NOT NULL,
	"catch_event_active" boolean DEFAULT true NOT NULL,
	"pokecoin_rate" integer DEFAULT 10 NOT NULL,
	"messages_per_reward" integer DEFAULT 10 NOT NULL,
	"counting_channels" text[] DEFAULT '{}' NOT NULL,
	"proofs_channel_id" text,
	"withdrawal_channel_id" text,
	"admin_user_id" text DEFAULT '763625050213187614' NOT NULL,
	"anti_spam_enabled" boolean DEFAULT true NOT NULL,
	"spam_time_window" integer DEFAULT 5 NOT NULL,
	"max_messages_in_window" integer DEFAULT 3 NOT NULL,
	"min_message_length" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"author_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"is_counted" boolean DEFAULT true NOT NULL,
	"is_spam" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"discriminator" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	"shiny_catches" integer DEFAULT 0 NOT NULL,
	"rare_shiny_catches" integer DEFAULT 0 NOT NULL,
	"pokecoins" integer DEFAULT 0 NOT NULL
);
