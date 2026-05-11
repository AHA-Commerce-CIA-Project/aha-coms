CREATE TABLE "user_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_user_id" uuid NOT NULL,
	"alias" varchar(255) NOT NULL,
	"alias_normalized" varchar(255) GENERATED ALWAYS AS (lower(regexp_replace(trim("alias"), '\s+', ' ', 'g'))) STORED NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" varchar(20) DEFAULT 'auto_seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "alias_collision_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_name" varchar(255) NOT NULL,
	"raw_name_normalized" varchar(255) NOT NULL,
	"suggested_identity_user_id" uuid,
	"source" varchar(20) NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_action" varchar(16)
);
--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_created_by_identity_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_collision_queue" ADD CONSTRAINT "alias_collision_queue_suggested_identity_user_id_identity_users_id_fk" FOREIGN KEY ("suggested_identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_collision_queue" ADD CONSTRAINT "alias_collision_queue_resolved_by_identity_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_aliases_alias_normalized_uniq" ON "user_aliases" USING btree ("alias_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "user_aliases_one_primary_per_user_uniq" ON "user_aliases" USING btree ("identity_user_id") WHERE "user_aliases"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "user_aliases_identity_user_id_idx" ON "user_aliases" USING btree ("identity_user_id");--> statement-breakpoint
CREATE INDEX "alias_collision_queue_status_idx" ON "alias_collision_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alias_collision_queue_normalized_idx" ON "alias_collision_queue" USING btree ("raw_name_normalized");