// rc/tambola-1.8.5 deliberate break W15-read-as-hint-missing: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W15-read-as-hint-missing.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W15-read-as-hint-missing"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
