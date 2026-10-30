// rc/tambola-1.8.5 deliberate break B02-empid-no-nfkc: changes one thing in a temp copy, shows the test RED, restores. Never edits the repo.
// Run: bun tools/matrix/breaks/B02-empid-no-nfkc.ts
const p = Bun.spawnSync(["bun", new URL("./run-breaks.ts", import.meta.url).pathname, "--only", "B02-empid-no-nfkc"], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
