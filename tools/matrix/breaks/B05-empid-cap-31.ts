// rc/tambola-1.8.5 deliberate break B05-empid-cap-31: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B05-empid-cap-31.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B05-empid-cap-31"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
