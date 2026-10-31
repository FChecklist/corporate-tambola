// rc/tambola-1.8.5 deliberate break W14-idkind-label: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W14-idkind-label.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W14-idkind-label"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
