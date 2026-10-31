// rc/tambola-1.8.5 deliberate break W05-join-chips-missing: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W05-join-chips-missing.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W05-join-chips-missing"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
