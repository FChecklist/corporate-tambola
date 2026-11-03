// rc/tambola-1.8.5 deliberate break B09-dup-after-cleaning-silent: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B09-dup-after-cleaning-silent.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B09-dup-after-cleaning-silent"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
