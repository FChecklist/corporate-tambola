// rc/tambola-1.8.5 deliberate break W13-host-ribbon-missing: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W13-host-ribbon-missing.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W13-host-ribbon-missing"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
