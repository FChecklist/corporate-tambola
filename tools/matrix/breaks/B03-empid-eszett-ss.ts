// rc/tambola-1.8.5 deliberate break B03-empid-eszett-ss: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B03-empid-eszett-ss.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B03-empid-eszett-ss"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
