// rc/tambola-1.8.5 deliberate break W06-join-chips-in-demo: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W06-join-chips-in-demo.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W06-join-chips-in-demo"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
