// rc/tambola-1.8.5 deliberate break B20-need-id-wrong-word: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B20-need-id-wrong-word.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B20-need-id-wrong-word"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
