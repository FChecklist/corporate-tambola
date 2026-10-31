// rc/tambola-1.8.5 deliberate break W03-thirty-minute-line: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W03-thirty-minute-line.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W03-thirty-minute-line"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
