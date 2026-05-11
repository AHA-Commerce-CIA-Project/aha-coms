CREATE TABLE "portal_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
