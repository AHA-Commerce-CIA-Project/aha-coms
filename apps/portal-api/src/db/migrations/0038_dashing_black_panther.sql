CREATE INDEX CONCURRENTLY "idx_identity_users_status" ON "identity_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_teams_name_lower" ON "teams" USING btree (lower("name"));