CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" varchar(255) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts_remaining" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"request_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" varchar(255),
	"request_ip" varchar(45) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_login_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_identity_user_id" uuid NOT NULL,
	"issued_by" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"reason" varchar(32) NOT NULL,
	"reason_text" text,
	"issued_from_ip" varchar(45),
	"consumed_from_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_time_login_links" ADD CONSTRAINT "one_time_login_links_target_identity_user_id_identity_users_id_fk" FOREIGN KEY ("target_identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_login_links" ADD CONSTRAINT "one_time_login_links_issued_by_identity_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_email_idx" ON "otp_codes" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "otp_codes_expires_idx" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "otp_request_log_email_time_idx" ON "otp_request_log" USING btree ("email_normalized","requested_at");--> statement-breakpoint
CREATE INDEX "otp_request_log_ip_time_idx" ON "otp_request_log" USING btree ("request_ip","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_login_links_token_hash_uniq" ON "one_time_login_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "one_time_login_links_target_idx" ON "one_time_login_links" USING btree ("target_identity_user_id");--> statement-breakpoint
CREATE INDEX "one_time_login_links_issued_by_idx" ON "one_time_login_links" USING btree ("issued_by");