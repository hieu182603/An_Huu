// Additive profile-v2 contract generation; preserve existing hand-documented
// schemas and YAML formatting. Run from backend, without loading env or a DB.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const { profileV2Object, partialProfileV2Object } = require("../src/modules/profiles/schema-v2");
const file = "docs/profile-v2.openapi.yaml";
const doc = parseDocument(fs.readFileSync(file, "utf8"));
// PartialPersonal shares Personal's properties anchor.
doc.setIn(["Personal", "properties", "maritalStatus"], schema(profileV2Object.shape.personal.shape.maritalStatus));
doc.setIn(["Personal", "properties", "careResponsibility"], schema(profileV2Object.shape.personal.shape.careResponsibility));
const asset = require("../src/modules/profiles/schema-v2").assetEntrySchema;
// PartialAssetEntry shares the same YAML properties anchor as AssetEntry.
doc.setIn(["AssetEntry", "properties", "type"], schema(asset.shape.type));
doc.setIn(["AssetEntry", "properties", "costBasis"], schema(asset.shape.costBasis));
const debt = require("../src/modules/profiles/schema-v2").debtEntrySchema;
// PartialDebtEntry shares DebtEntry's properties anchor.
doc.setIn(["DebtEntry", "properties", "illustration"], schema(debt.shape.illustration));
for (const [name, shape] of [["FinancialDataV2", profileV2Object.shape], ["ProfileChangesV2", partialProfileV2Object.shape]]) {
  for (const key of ["lossTolerance", "incomeStability", "employerConcentration", "liquidityNeeds", "goals", "retirementGoal", "retirementSurvey"])
    doc.setIn([name, "properties", key], schema(shape[key]));
}
fs.writeFileSync(file, String(doc));
