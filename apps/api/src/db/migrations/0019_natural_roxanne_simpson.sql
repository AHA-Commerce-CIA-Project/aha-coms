CREATE TABLE "portal_broker_signing_keys" (
	"kid" varchar(40) PRIMARY KEY NOT NULL,
	"alg" varchar(10) NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_secret_name" varchar(200) NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_signing_key" ON "portal_broker_signing_keys" USING btree ("status") WHERE "portal_broker_signing_keys"."status" = 'active';--> statement-breakpoint
CREATE INDEX "signing_keys_jwks_set" ON "portal_broker_signing_keys" USING btree ("status") WHERE "portal_broker_signing_keys"."status" IN ('active', 'retiring');