// rc/tambola-1.8.5 deliberate break B16-email-in-emp-game-message: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B16-email-in-emp-game-message.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B16-email-in-emp-game-message"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
