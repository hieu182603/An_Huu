// Additive profile-v2 contract generation; preserve existing hand-documented
// schemas and YAML formatting. Run from backend, without loading env or a DB.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const { profileV2Object, partialProfileV2Object } = require("../src/modules/profiles/schema-v2");
const file = "docs/profile-v2.openapi.yaml";
const doc = parseDocument(fs.readFileSync(file, "utf8"));
const asset = require("../src/modules/profiles/schema-v2").assetEntrySchema.innerType();
// PartialAssetEntry shares the same YAML properties anchor as AssetEntry.
doc.setIn(["AssetEntry", "properties", "type"], schema(asset.shape.type));
doc.setIn(["AssetEntry", "properties", "costBasis"], schema(asset.shape.costBasis));
for (const [name, shape] of [["FinancialDataV2", profileV2Object.shape], ["ProfileChangesV2", partialProfileV2Object.shape]]) {
  for (const key of ["lossTolerance", "incomeStability", "employerConcentration", "liquidityNeeds", "goals"])
    doc.setIn([name, "properties", key], schema(shape[key]));
}
fs.writeFileSync(file, String(doc));
