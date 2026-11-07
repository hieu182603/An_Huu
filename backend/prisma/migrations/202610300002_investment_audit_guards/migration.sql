-- Additive guards. No changes to legacy rows, roles, or production data.
ALTER TABLE "investment_recommendations" ADD CONSTRAINT "investment_recommendation_status"
CHECK ("status" IN ('DRAFT','DATA_VALIDATED','SUITABILITY_CHECKED','PENDING_APPROVAL','APPROVED','PUBLISHED','REJECTED','EXPIRED','SUPERSEDED'));
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holding_nonnegative"
CHECK ("quantity" >= 0 AND "unitCost" >= 0 AND "revision" > 0);

CREATE FUNCTION investment_approval_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Investment approval history is append-only';
END $$;
CREATE TRIGGER investment_approval_immutable BEFORE UPDATE OR DELETE ON "investment_approvals"
FOR EACH ROW EXECUTE FUNCTION investment_approval_immutable();

CREATE FUNCTION investment_recommendation_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "plan_versions" v JOIN "retirement_plans" p ON p.id = v."planId"
    WHERE v.id = NEW."planVersionId" AND p."userId" = NEW."userId"
  ) THEN RAISE EXCEPTION 'Recommendation plan owner mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investment_recommendation_owner_guard BEFORE INSERT OR UPDATE OF "planVersionId", "userId" ON "investment_recommendations"
FOR EACH ROW EXECUTE FUNCTION investment_recommendation_owner_guard();

CREATE FUNCTION investment_independent_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decision = 'approve' AND NOT EXISTS (
    SELECT 1 FROM "investment_recommendations" r
    JOIN "investment_role_grants" g ON g."userId" = NEW."actorId" AND g.role = 'APPROVER'
    JOIN users u ON u.id = NEW."actorId" AND u.status = 'ACTIVE'
    WHERE r.id = NEW."recommendationId" AND r."createdBy" <> NEW."actorId" AND r."userId" <> NEW."actorId"
      AND r."contentHash" = NEW."contentHash" AND (r.document->>'revision')::int = NEW.revision
  ) THEN RAISE EXCEPTION 'Independent qualified approval of exact content required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investment_independent_approval_guard BEFORE INSERT ON "investment_approvals"
FOR EACH ROW EXECUTE FUNCTION investment_independent_approval_guard();
