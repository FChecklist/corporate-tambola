// rc/tambola-1.8.5 deliberate break B19-idkind-not-in-info: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B19-idkind-not-in-info.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B19-idkind-not-in-info"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
