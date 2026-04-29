ALTER TABLE "access_audit_log" ADD COLUMN "actor_ip" varchar(45);--> statement-breakpoint
ALTER TABLE "access_audit_log" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "access_audit_log" ADD COLUMN "actor_app_id" uuid;--> statement-breakpoint
ALTER TABLE "access_audit_log" ADD COLUMN "target_app_id" uuid;--> statement-breakpoint
ALTER TABLE "access_audit_log" ADD CONSTRAINT "access_audit_log_actor_app_id_app_registry_id_fk" FOREIGN KEY ("actor_app_id") REFERENCES "public"."app_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_audit_log" ADD CONSTRAINT "access_audit_log_target_app_id_app_registry_id_fk" FOREIGN KEY ("target_app_id") REFERENCES "public"."app_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_audit_log_actor_app_created_at" ON "access_audit_log" USING btree ("actor_app_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_access_audit_log_target_app_created_at" ON "access_audit_log" USING btree ("target_app_id","created_at");