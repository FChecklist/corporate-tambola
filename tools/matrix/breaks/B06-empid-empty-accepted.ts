// rc/tambola-1.8.5 deliberate break B06-empid-empty-accepted: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B06-empid-empty-accepted.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B06-empid-empty-accepted"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
