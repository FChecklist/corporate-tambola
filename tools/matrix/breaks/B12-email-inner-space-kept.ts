// rc/tambola-1.8.5 deliberate break B12-email-inner-space-kept: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B12-email-inner-space-kept.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B12-email-inner-space-kept"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
