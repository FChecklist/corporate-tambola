// rc/tambola-1.8.5 deliberate break W04-watched-keeps-results: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W04-watched-keeps-results.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W04-watched-keeps-results"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
