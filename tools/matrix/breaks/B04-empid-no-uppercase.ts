// rc/tambola-1.8.5 deliberate break B04-empid-no-uppercase: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B04-empid-no-uppercase.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B04-empid-no-uppercase"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
