// rc/tambola-1.8.5 deliberate break W09-final-results-everyone-you: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W09-final-results-everyone-you.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W09-final-results-everyone-you"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
