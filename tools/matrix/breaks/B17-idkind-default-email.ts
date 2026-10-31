// rc/tambola-1.8.5 deliberate break B17-idkind-default-email: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B17-idkind-default-email.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B17-idkind-default-email"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
