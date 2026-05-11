CREATE TABLE "session_revocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gip_uid" text NOT NULL,
	"reason" varchar(30) NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"not_before" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"subscribed_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_webhook_endpoints_app_id_url_unique" UNIQUE("app_id","url")
);
--> statement-breakpoint
ALTER TABLE "session_revocations" ADD CONSTRAINT "session_revocations_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_webhook_endpoints" ADD CONSTRAINT "app_webhook_endpoints_app_id_app_registry_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_revocations_user_revoked_idx" ON "session_revocations" USING btree ("user_id","revoked_at");