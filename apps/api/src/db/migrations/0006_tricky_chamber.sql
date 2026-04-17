CREATE TABLE "auth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"app_slug" varchar(50) NOT NULL,
	"user_id" uuid NOT NULL,
	"gip_uid" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"portal_role" varchar(20) NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_handoffs_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_handoffs" ADD CONSTRAINT "auth_handoffs_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;