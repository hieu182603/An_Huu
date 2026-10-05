import { test } from "node:test";
import assert from "node:assert/strict";
import { vi } from "../src/i18n/translations/vi.ts";
import { en } from "../src/i18n/translations/en.ts";

test("i18n dictionary completeness: all vi keys exist in en and vice versa", () => {
  const viKeys = Object.keys(vi).sort();
  const enKeys = Object.keys(en).sort();

  const missingInEn = viKeys.filter((k) => !(k in en));
  const missingInVi = enKeys.filter((k) => !(k in vi));

  assert.deepEqual(
    missingInEn,
    [],
    `Keys present in vi.ts but missing in en.ts: ${missingInEn.join(", ")}`
  );
  assert.deepEqual(
    missingInVi,
    [],
    `Keys present in en.ts but missing in vi.ts: ${missingInVi.join(", ")}`
  );
  assert.equal(viKeys.length, enKeys.length);
  assert.ok(viKeys.length > 50, "Should have a comprehensive translation dictionary");
});

test("anti-slop and typographical integrity: no em-dashes in any translation string", () => {
  const EM_DASH = "—";
  for (const [key, val] of Object.entries(vi)) {
    assert.ok(
      !val.includes(EM_DASH),
      `Vietnamese key "${key}" contains forbidden em-dash: "${val}"`
    );
  }
  for (const [key, val] of Object.entries(en)) {
    assert.ok(
      !val.includes(EM_DASH),
      `English key "${key}" contains forbidden em-dash: "${val}"`
    );
  }
});

test("parameter interpolation consistency between vi and en", () => {
  const paramRegex = /\{([a-zA-Z0-9_]+)\}/g;

  for (const key of Object.keys(vi)) {
    const viVal = vi[key];
    const enVal = en[key];

    const viParams = Array.from(viVal.matchAll(paramRegex), (m) => m[1]).sort();
    const enParams = Array.from(enVal.matchAll(paramRegex), (m) => m[1]).sort();

    assert.deepEqual(
      viParams,
      enParams,
      `Interpolation parameters mismatch for key "${key}": vi=${JSON.stringify(viParams)}, en=${JSON.stringify(enParams)}`
    );
  }
});

test("essential user and admin navigation items are fully covered", () => {
  const essentialKeys = [
    "nav.dashboard",
    "nav.goal",
    "nav.plan",
    "nav.simulation",
    "nav.debts",
    "nav.assistant",
    "nav.account",
    "admin_nav.dashboard",
    "admin_nav.users",
    "admin_nav.operations",
    "admin_nav.support",
    "admin_nav.content",
    "admin_nav.settings",
    "admin_topbar.search_placeholder",
    "admin_topbar.urgent_tickets",
    "dashboard.hero.tag",
    "dashboard.cashflow.title",
    "dashboard.wealth.title",
    "dashboard.balance.title",
    "dashboard.pension.title",
    "account.language_label",
  ];

  for (const key of essentialKeys) {
    assert.ok(Boolean(vi[key]), `Missing essential vi key: ${key}`);
    assert.ok(Boolean(en[key]), `Missing essential en key: ${key}`);
    assert.notEqual(vi[key].trim(), "", `Empty vi key: ${key}`);
    assert.notEqual(en[key].trim(), "", `Empty en key: ${key}`);
  }
});
