// rc/tambola-1.8.5 deliberate break B22-idkind-not-saved: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B22-idkind-not-saved.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B22-idkind-not-saved"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
