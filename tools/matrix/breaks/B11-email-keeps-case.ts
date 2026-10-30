// rc/tambola-1.8.5 deliberate break B11-email-keeps-case: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B11-email-keeps-case.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B11-email-keeps-case"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
