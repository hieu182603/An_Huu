-- Add query indexes already declared in schema.prisma. IF NOT EXISTS also
-- supports an existing database where these indexes were provisioned earlier.
-- No table rows or previously applied migration files are changed.
CREATE INDEX IF NOT EXISTS "articles_kind_status_idx" ON "articles"("kind", "status");

-- statement-break
CREATE INDEX IF NOT EXISTS "simulation_scenarios_userId_idx" ON "simulation_scenarios"("userId");
