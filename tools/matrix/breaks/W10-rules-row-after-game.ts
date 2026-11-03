// rc/tambola-1.8.5 deliberate break W10-rules-row-after-game: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/W10-rules-row-after-game.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "W10-rules-row-after-game"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
