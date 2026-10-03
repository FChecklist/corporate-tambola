import { expect, test } from "bun:test";
import { SCHEMA } from "../src/worker";

// The SQL file wrangler applies must say exactly what the code expects, so a schema change cannot be forgotten at deploy time.
test("the migration files (0001 + 0002) match SCHEMA in the Worker", async () => {
  const sql = (await Bun.file(new URL("../migrations/0001_init.sql", import.meta.url)).text()) + "\n" + (await Bun.file(new URL("../migrations/0002_seat.sql", import.meta.url)).text());
  const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
  expect(norm(sql)).toBe(norm(SCHEMA.map((s) => s + ";").join("\n")));
});
