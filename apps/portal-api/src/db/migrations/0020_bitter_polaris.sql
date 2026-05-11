ALTER TABLE "app_registry" ALTER COLUMN "contract_version" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "service_account_email" varchar(200);