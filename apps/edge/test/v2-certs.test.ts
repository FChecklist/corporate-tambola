// V2 item 3: winner certificates. Name or ID (only while the game still holds it), game id, ticket number, prize and a verification link; mobile and e-mail never. The verification record is signed,
// hash-chained, keeps only non-personal fields, and anyone can check it.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, W, call, j, keyH, paidGame, q, reset, restore } from "./param-harness";
import { erasePersonal } from "../src/lifecycle";
import { gameKey, guests, labelHost, winner, T } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

async function gameWithWinners() {
  const g = await paidGame(); const seats = await guests(g.id, 3);
  winner(g.id, "top", 1, seats[0]!); winner(g.id, "full", 1, seats[1]!);
  return { g, seats };
}
const issue = (id: string, key: string) => call("POST", `/api/z/${id}/v2/certs/issue`, {}, keyH(key));
const list = async (id: string, key: string) => j(await call("GET", `/api/z/${id}/v2/certs`, undefined, keyH(key)));
const verify = async (id: string) => { const r = await call("GET", `/api/v2/verify/${id}`); return { status: r.status, body: await j(r) }; };

describe("making certificates", () => {
  test("none until winners are known; then one per winning ticket and prize; running it again changes nothing", async () => {
    const g = await paidGame();
    const none = await issue(g.id, g.key); expect(none.status).toBe(409); expect((await j(none)).code).toBe("no-winners");
    const w = await gameWithWinners();
    const a = await j(await issue(w.g.id, w.g.key)); expect(a).toMatchObject({ ok: true, made: 2, total: 2 });
    const b = await j(await issue(w.g.id, w.g.key)); expect(b).toMatchObject({ ok: true, made: 0, total: 2 });
    const l = await list(w.g.id, w.g.key); expect(l.certificates.length).toBe(2); expect(l.notYetMade).toBe(0);
    expect(l.certificates.map((c: any) => c.prize).sort()).toEqual(["Full House", "Top Line"]);
    expect(l.certificates[0].verifyUrl).toMatch(/\/verify\.html\?c=[0-9a-f]{20}$/);
  });
  test("a winner recorded later gets a certificate on the next run, and the list says what is not yet made", async () => {
    const { g, seats } = await gameWithWinners(); await issue(g.id, g.key);
    winner(g.id, "mid", 1, seats[2]!);
    expect((await list(g.id, g.key)).notYetMade).toBe(1);
    expect((await j(await issue(g.id, g.key))).made).toBe(1);
  });
  test("a claim the Host rejected gets no certificate", async () => {
    const { g, seats } = await gameWithWinners();
    W.raw.prepare("INSERT INTO v2_claim_review(eid,round,pattern,ticket,decision,reason,by,at_ms) VALUES(?,?,?,?,?,?,?,?)").run(g.id, 1, "top", seats[0], "reject", "not a full line", "host", T);
    expect((await j(await issue(g.id, g.key))).made).toBe(1);
    expect((await list(g.id, g.key)).certificates.map((c: any) => c.prize)).toEqual(["Full House"]);
  });
});

describe("who may make and download them", () => {
  test("the organizer and the organizer's game key; not a Host, an AI key, a stranger or nobody", async () => {
    const { g } = await gameWithWinners(); const stranger = await paidGame();
    expect((await issue(g.id, await gameKey(g))).status).toBe(200);
    for (const k of [await labelHost(g), g.ai, stranger.key]) { const r = await issue(g.id, k); expect(r.status).toBe(403); expect((await j(r)).code).toBe("not-allowed"); }
    expect((await call("POST", `/api/z/${g.id}/v2/certs/issue`, {})).status).toBeGreaterThanOrEqual(401);
  });
});

describe("what the certificate and the record hold", () => {
  test("the downloaded certificate shows name, game id, ticket number, prize and a verification link; never the mobile or the e-mail", async () => {
    const { g, seats } = await gameWithWinners(); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates.find((x: any) => x.prize === "Top Line");
    const r = await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html`, undefined, keyH(g.key)); const html = await r.text();
    expect(r.status).toBe(200); expect(r.headers.get("content-type")).toMatch(/text\/html/); expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain("Guest 1"); expect(html).toContain(g.id); expect(html).toContain("Top Line"); expect(html).toContain(`${seats[0]}`); expect(html).toContain(`/verify.html?c=${c.id}`);
    expect(html).not.toMatch(/9100000\d{2}/); expect(html).not.toContain("acme.com"); expect(html).not.toContain("98765");
    const dl = await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html?download=1`, undefined, keyH(g.key)); expect(dl.headers.get("content-disposition")).toMatch(/attachment; filename="certificate-/);
  });
  test("a typed name cannot inject markup into the certificate", async () => {
    const g = await paidGame(); await guests(g.id, 1);
    W.raw.prepare("UPDATE participant SET name=? WHERE eid=?").run("<script>x</script>", g.id);
    // the sealed copy is what the certificate reads: seal a hostile name the way the game does
    const { sealPii } = await import("../src/pii");
    const sealed = await sealPii(W.env as any, { name: "<img src=x onerror=alert(1)>", empId: "E1" } as any);
    W.raw.prepare("UPDATE participant SET pii=? WHERE eid=?").run(sealed, g.id);
    winner(g.id, "top", 1, 1); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates[0];
    const html = await (await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html`, undefined, keyH(g.key))).text();
    expect(html).not.toContain("<img src=x"); expect(html).toContain("&lt;img src=x");
  });
  test("the record in the database holds only non-personal fields", async () => {
    const { g } = await gameWithWinners(); await issue(g.id, g.key);
    const cols = (W.raw.prepare("PRAGMA table_info(v2_cert)").all() as any[]).map((c) => c.name).sort();
    expect(cols).toEqual(["eid", "hash", "id", "issued_ms", "ordinal", "pattern", "prev", "prize", "round", "seq", "sig", "ticket"]);
    const all = JSON.stringify(q("SELECT * FROM v2_cert"));
    for (const s of ["Guest", "9100000", "acme.com", "98765", "boss@"]) expect(all).not.toContain(s);
  });
  test("an AI-labelled call (the organizer's AI key cannot; an AI game key or a declared AI can) never gets a name", async () => {
    const { g } = await gameWithWinners(); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates[0];
    const ga = await gameKey(g, { ai: true, label: "ChatGPT" });
    const r1 = await (await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html`, undefined, keyH(ga))).text();
    const r2 = await (await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html`, undefined, { ...keyH(g.key), "x-ai-model": "AI: ChatGPT" })).text();
    for (const t of [r1, r2]) { expect(t).not.toContain("Guest "); expect(t).toContain("Ticket"); expect(t).toContain(c.id); }
  });
  test("after the 24-hour deletion the certificate still verifies and says 'Ticket No.', with no name", async () => {
    const { g } = await gameWithWinners(); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates[0];
    await erasePersonal(W.env as any, g.id, T + 30 * HOUR, "test");
    const html = await (await call("GET", `/api/z/${g.id}/v2/certs/${c.id}.html`, undefined, keyH(g.key), T + 31 * HOUR)).text();
    expect(html).not.toContain("Guest "); expect(html).toContain("Ticket");
    expect((await verify(c.id)).body.valid).toBe(true);
  });
  test("the spreadsheet list has certificate numbers and prizes, no names", async () => {
    const { g } = await gameWithWinners(); await issue(g.id, g.key);
    const r = await call("GET", `/api/z/${g.id}/v2/certs/csv`, undefined, keyH(g.key)); const t = await r.text();
    expect(r.headers.get("content-type")).toMatch(/text\/csv/); expect(t.split("\n")[0]).toBe("certificate,ticket,prize,round,issued,verify");
    expect(t.trim().split("\n").length).toBe(3); expect(t).not.toContain("Guest");
  });
});

describe("anyone can verify, and a changed record is caught", () => {
  test("public check: no key needed, no personal data in the answer", async () => {
    const { g, seats } = await gameWithWinners(); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates.find((x: any) => x.prize === "Top Line");
    const v = await verify(c.id); expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ valid: true, certificate: c.id, game: g.id, ticket: seats[0], prize: "Top Line", round: 1, position: c.position, ofTotal: 2 });
    const text = JSON.stringify(v.body); for (const s of ["Guest", "acme.com", "9100000"]) expect(text).not.toContain(s);
    const bad = await verify("0".repeat(20)); expect(bad.status).toBe(404); expect(bad.body.valid).toBe(false);
  });
  test("changing the prize, the ticket or the signature of a record makes it, and every record after it, fail", async () => {
    for (const col of ["prize", "ticket", "sig", "hash", "issued_ms"]) {
      reset();
      const { g } = await gameWithWinners(); await issue(g.id, g.key);
      const cs = (await list(g.id, g.key)).certificates; const first = cs.find((c: any) => c.position === 1), second = cs.find((c: any) => c.position === 2);
      expect((await verify(first.id)).body.valid).toBe(true);
      const val = col === "prize" ? "Super Bumper House" : col === "ticket" ? 99 : col === "issued_ms" ? 1 : "f".repeat(64);
      W.raw.prepare(`UPDATE v2_cert SET ${col}=? WHERE id=?`).run(val, first.id);
      expect((await verify(first.id)).body.valid, col).toBe(false);
      expect((await verify(second.id)).body.valid, col + " (later record)").toBe(false);
    }
  });
  test("removing a record from the middle of the chain is caught", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 3);
    for (const [i, p] of ["top", "mid", "bot"].entries()) winner(g.id, p, 1, seats[i]!);
    await issue(g.id, g.key);
    const cs = (await list(g.id, g.key)).certificates; const mid = cs.find((c: any) => c.position === 2), last = cs.find((c: any) => c.position === 3);
    W.raw.prepare("DELETE FROM v2_cert WHERE id=?").run(mid.id);
    expect((await verify(last.id)).body.valid).toBe(false);
  });
  test("the signature depends on the server's secret: a record forged without it does not verify", async () => {
    const { g } = await gameWithWinners(); await issue(g.id, g.key);
    const c = (await list(g.id, g.key)).certificates[0];
    (W.env as any).DATA_KEY = "a-different-key"; // as if the signing secret were not known to whoever edited the row
    expect((await verify(c.id)).body.valid).toBe(false);
  });
  test("each game has its own chain", async () => {
    const a = await gameWithWinners(); const b = await gameWithWinners();
    await issue(a.g.id, a.g.key); await issue(b.g.id, b.g.key);
    const ca = (await list(a.g.id, a.g.key)).certificates, cb = (await list(b.g.id, b.g.key)).certificates;
    expect(ca.map((c: any) => c.position).sort()).toEqual([1, 2]); expect(cb.map((c: any) => c.position).sort()).toEqual([1, 2]);
    expect((await call("GET", `/api/z/${a.g.id}/v2/certs/${cb[0].id}.html`, undefined, keyH(a.g.key))).status).toBe(404); // another game's certificate is not downloadable through this game
  });
});
