CREATE TABLE "taxonomy_edit_locks" (
	"taxonomy_id" varchar(64) PRIMARY KEY NOT NULL,
	"acquired_by" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_edit_locks" ADD CONSTRAINT "taxonomy_edit_locks_acquired_by_identity_users_id_fk" FOREIGN KEY ("acquired_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;