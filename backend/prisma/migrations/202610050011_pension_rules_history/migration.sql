-- statement-break
CREATE TABLE "legal_rule_set_versions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "knowledgeAsOf" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "document" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "validation" JSONB,
    "review" JSONB,
    "createdBy" TEXT NOT NULL,
    "authorIds" TEXT[],
    "reviewedBy" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_rule_set_versions_pkey" PRIMARY KEY ("id")
);

-- statement-break
CREATE TABLE "social_insurance_history_versions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "parentHash" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,

    CONSTRAINT "social_insurance_history_versions_pkey" PRIMARY KEY ("id")
);

-- statement-break
CREATE TABLE "pension_estimates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "historyVersionId" TEXT NOT NULL,
    "legalRuleSetVersionId" TEXT NOT NULL,
    "engineCode" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pension_estimates_pkey" PRIMARY KEY ("id")
);

-- statement-break
CREATE INDEX "legal_rule_set_versions_code_status_effectiveFrom_idx" ON "legal_rule_set_versions"("code", "status", "effectiveFrom");

-- statement-break
CREATE UNIQUE INDEX "legal_rule_set_versions_code_version_key" ON "legal_rule_set_versions"("code", "version");

-- statement-break
CREATE UNIQUE INDEX "social_insurance_history_versions_userId_revision_key" ON "social_insurance_history_versions"("userId", "revision");

-- statement-break
CREATE UNIQUE INDEX "social_insurance_history_versions_id_userId_key" ON "social_insurance_history_versions"("id", "userId");

-- statement-break
CREATE INDEX "pension_estimates_userId_createdAt_idx" ON "pension_estimates"("userId", "createdAt");

-- statement-break
ALTER TABLE "legal_rule_set_versions" ADD CONSTRAINT "legal_rule_set_versions_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "legal_rule_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- statement-break
ALTER TABLE "social_insurance_history_versions" ADD CONSTRAINT "social_insurance_history_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- statement-break
ALTER TABLE "social_insurance_history_versions" ADD CONSTRAINT "social_insurance_history_versions_parentVersionId_userId_fkey" FOREIGN KEY ("parentVersionId", "userId") REFERENCES "social_insurance_history_versions"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- statement-break
ALTER TABLE "pension_estimates" ADD CONSTRAINT "pension_estimates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- statement-break
ALTER TABLE "pension_estimates" ADD CONSTRAINT "pension_estimates_historyVersionId_userId_fkey" FOREIGN KEY ("historyVersionId", "userId") REFERENCES "social_insurance_history_versions"("id", "userId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- statement-break
ALTER TABLE "pension_estimates" ADD CONSTRAINT "pension_estimates_legalRuleSetVersionId_fkey" FOREIGN KEY ("legalRuleSetVersionId") REFERENCES "legal_rule_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- statement-break
ALTER TABLE "legal_rule_set_versions"
  ADD CONSTRAINT "legal_rule_valid_revision" CHECK ("revision" >= 1 AND "version" >= 1),
  ADD CONSTRAINT "legal_rule_valid_period" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  ADD CONSTRAINT "legal_rule_valid_hash" CHECK ("documentHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "legal_rule_valid_state" CHECK ("status" IN ('DRAFT','VALIDATED','REVIEWED','PUBLISHED')),
  ADD CONSTRAINT "legal_rule_authors" CHECK ("authorIds" IS NOT NULL AND cardinality("authorIds") > 0 AND array_position("authorIds", NULL) IS NULL AND "createdBy" = ANY("authorIds")),
  ADD CONSTRAINT "legal_rule_no_self_supersession" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id"),
  ADD CONSTRAINT "legal_rule_review_required" CHECK ("status" NOT IN ('REVIEWED','PUBLISHED') OR
    ("review" IS NOT NULL AND "validation" IS NOT NULL AND "reviewedBy" IS NOT NULL AND NOT ("reviewedBy" = ANY("authorIds")))),
  ADD CONSTRAINT "legal_rule_publication_required" CHECK (("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "publishedBy" IS NOT NULL) OR
    ("status" <> 'PUBLISHED' AND "publishedAt" IS NULL AND "publishedBy" IS NULL));

-- statement-break
ALTER TABLE "social_insurance_history_versions"
  ADD CONSTRAINT "insurance_history_revision" CHECK ("revision" >= 1 AND "schemaVersion" = 1),
  ADD CONSTRAINT "insurance_history_hash" CHECK ("documentHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "insurance_history_parent" CHECK (("revision" = 1 AND "parentVersionId" IS NULL AND "parentHash" IS NULL) OR
    ("revision" > 1 AND "parentVersionId" IS NOT NULL AND "parentVersionId" <> "id" AND "parentHash" IS NOT NULL AND "parentHash" ~ '^[a-f0-9]{64}$'));

-- statement-break
ALTER TABLE "pension_estimates" ADD CONSTRAINT "pension_estimate_hashes" CHECK (
  "inputHash" ~ '^[a-f0-9]{64}$' AND "integrityHash" ~ '^[a-f0-9]{64}$');

-- statement-break
CREATE FUNCTION "guard_pension_immutable_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Immutable pension record' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- statement-break
CREATE TRIGGER "legal_rule_published_immutable" BEFORE UPDATE OR DELETE ON "legal_rule_set_versions"
FOR EACH ROW EXECUTE FUNCTION "guard_pension_immutable_update"();

-- statement-break
CREATE FUNCTION "guard_insurance_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Append-only insurance record' USING ERRCODE = '23514';
END;
$$;

-- statement-break
CREATE TRIGGER "insurance_history_append_only" BEFORE UPDATE ON "social_insurance_history_versions"
FOR EACH ROW EXECUTE FUNCTION "guard_insurance_append_only"();

-- statement-break
CREATE TRIGGER "pension_estimate_immutable" BEFORE UPDATE ON "pension_estimates"
FOR EACH ROW EXECUTE FUNCTION "guard_insurance_append_only"();
