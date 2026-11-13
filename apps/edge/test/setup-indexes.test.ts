// 13 Nov 2026 (TARGET-99 Tambola plan): sign-in, create and publish looked up organizer_key, entitlement and engagement by organizer with no index, so every game set-up scanned those tables whole several times,
// and twelve set-ups in the same second multiplied that. These tests read the database's own query plan for the exact statements the worker runs and fail if a lookup goes back to scanning.
import { beforeEach, describe, expect, test } from "bun:test";
import { q, reset } from "./param-harness";

const plan = (sql: string, ...a: any[]): string => q("EXPLAIN QUERY PLAN " + sql, ...a).map((r: any) => r.detail).join(" | ");
const ORG_TEST = "SELECT 1 AS x FROM organizer_key WHERE org=? AND is_test=1 LIMIT 1";
const KEY_ORG_MAX = "SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?";
const ENT = "SELECT id, pack FROM entitlement WHERE org=? AND eid IS NULL AND pack>=? ORDER BY pack, created_ms LIMIT 1";
const DRAFTS = "SELECT COUNT(*) AS c FROM engagement e WHERE e.org=? AND e.pack=0 AND NOT EXISTS (SELECT 1 FROM kv WHERE k='pub/' || e.id)";

describe("the set-up path looks organizers up by index, not by scanning", () => {
  beforeEach(() => reset({ TEST_MODE: "1" } as any));

  test("organizer_key by org (test-account check at create and publish, key trimming at sign-in)", () => {
    expect(plan(ORG_TEST, "x")).toContain("organizer_key_org");
    expect(plan(KEY_ORG_MAX, "x")).toContain("organizer_key_org");
    expect(plan(ORG_TEST, "x")).not.toMatch(/SCAN organizer_key/);
  });

  test("entitlement by org (a bought or free pack, asked four times per game set-up)", () => {
    expect(plan(ENT, "x", 20)).toContain("entitlement_org");
    expect(plan(ENT, "x", 20)).not.toMatch(/SCAN entitlement/);
  });

  test("engagement by org (the unpublished-drafts count at create)", () => {
    expect(plan(DRAFTS, "x")).toContain("engagement_org");
    expect(plan(DRAFTS, "x")).not.toMatch(/SCAN e/);
  });

  test("falsify: without the three indexes the very same statements DO scan (so the tests above can fail)", () => {
    for (const i of ["organizer_key_org", "entitlement_org", "engagement_org"]) q("DROP INDEX " + i);
    expect(plan(ORG_TEST, "x")).toMatch(/SCAN/);
    expect(plan(ENT, "x", 20)).toMatch(/SCAN/);
    expect(plan(DRAFTS, "x")).toMatch(/SCAN/);
  });
});
