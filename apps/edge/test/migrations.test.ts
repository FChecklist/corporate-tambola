import { expect, test } from "bun:test";
import { SCHEMA } from "../src/worker";

// The SQL files wrangler applies must say exactly what the code expects, so a schema change cannot be forgotten at deploy time.
const FILES = ["0001_init.sql", "0002_seat.sql", "0003_seat_join_round.sql", "0004_privacy.sql", "0005_winners.sql", "0006_link_expiry.sql", "0007_login_link.sql", "0008_terms.sql", "0009_partner_hashes.sql", "0010_audit.sql", "0011_participant_shred.sql", "0012_visits.sql"];
test("the migration files (0001 to 0012) match SCHEMA in the Worker", async () => {
  const sql = (await Promise.all(FILES.map((f) => Bun.file(new URL("../migrations/" + f, import.meta.url)).text()))).join("\n");
  const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
  expect(norm(sql)).toBe(norm(SCHEMA.map((s) => s + ";").join("\n")));
});
