CREATE TABLE "user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "employee_id" TO "attendance_name";--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_emails_email" ON "user_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_emails_user_id" ON "user_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_attendance_name" ON "users" USING btree ("attendance_name");