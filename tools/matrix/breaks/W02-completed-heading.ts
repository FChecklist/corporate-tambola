// rc/tambola-1.8.5 deliberate break W02-completed-heading: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W02-completed-heading.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W02-completed-heading"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
