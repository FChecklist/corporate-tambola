// rc/tambola-1.8.5 deliberate break B01-empid-keeps-dash: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B01-empid-keeps-dash.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B01-empid-keeps-dash"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
