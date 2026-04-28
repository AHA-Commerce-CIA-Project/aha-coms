CREATE TABLE "app_manifests" (
	"app_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"config_schema" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_sub" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "bulk_edit_locks" (
	"app_id" uuid PRIMARY KEY NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acquired_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_manifests" ADD CONSTRAINT "app_manifests_app_id_app_registry_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_config" ADD CONSTRAINT "app_user_config_portal_sub_identity_users_id_fk" FOREIGN KEY ("portal_sub") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_config" ADD CONSTRAINT "app_user_config_app_id_app_manifests_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_manifests"("app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user_config" ADD CONSTRAINT "app_user_config_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_edit_locks" ADD CONSTRAINT "bulk_edit_locks_app_id_app_manifests_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_manifests"("app_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_edit_locks" ADD CONSTRAINT "bulk_edit_locks_acquired_by_identity_users_id_fk" FOREIGN KEY ("acquired_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_config_portal_sub_app_id_uniq" ON "app_user_config" USING btree ("portal_sub","app_id");--> statement-breakpoint
CREATE INDEX "app_user_config_app_id_idx" ON "app_user_config" USING btree ("app_id");