// rc/tambola-1.8.5 deliberate break W12-prize-won-not-crossed: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W12-prize-won-not-crossed.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W12-prize-won-not-crossed"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
