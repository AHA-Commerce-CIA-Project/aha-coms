ALTER TABLE "app_registry" ADD COLUMN "adapter_type" varchar(40) DEFAULT 'server_middleware' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "transport_mode" varchar(40) DEFAULT 'portable_token' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "handoff_mode" varchar(40) DEFAULT 'one_time_code' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "broker_origin" text;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "contract_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "compliance_status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "manifest_path" text;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "last_verified_at" timestamp with time zone;