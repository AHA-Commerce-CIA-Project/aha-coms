CREATE TABLE "webhook_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event" varchar(64) NOT NULL,
	"event_id" uuid NOT NULL,
	"json_body" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"locked_by" varchar(64),
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery_jobs" ADD CONSTRAINT "webhook_delivery_jobs_endpoint_id_app_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."app_webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_jobs_poll_idx" ON "webhook_delivery_jobs" USING btree ("status","next_attempt_at");