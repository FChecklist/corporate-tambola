// V2 audit round 8 (minor findings): a Host who steps down or is replaced has their details wiped like the organizer's own "retire", and a caller with no key never reads a Host's rejection reason.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, j, keyH, paidGame, q, reset, restore } from "./param-harness";
import { guests, labelHost, winner } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

describe("step-down and hand-over wipe the Host's details", () => {
  test("stepping down leaves no sealed e-mail or details on the Host's rows", async () => {
    const g = await paidGame(); const h = await labelHost(g, "Priya");
    W.raw.prepare("INSERT INTO organizer_key(hash,org,kind,label,created_ms,host_id,email_sealed,pii,revoked) SELECT 'dev'||hash,org,'host','device',created_ms,hash,'x-sealed','y-sealed',0 FROM organizer_key WHERE scope_eid=?").run(g.id); // a row of the same Host that holds details // as a Host with an e-mail and mobile would hold them
    expect((await call("POST", `/api/z/${g.id}/v2/host/stepdown`, {}, keyH(h))).status).toBe(200);
    const rows = q("SELECT revoked, email_sealed, pii FROM organizer_key WHERE host_id IN (SELECT hash FROM organizer_key WHERE scope_eid=?) OR scope_eid=?", g.id, g.id) as any[];
    expect(rows.length).toBe(2);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) { expect(r.revoked).toBe(1); expect(r.email_sealed).toBeNull(); expect(r.pii).toBeNull(); }
  });
  test("an approved hand-over wipes the old Host's details too", async () => {
    const g = await paidGame(); const h = await labelHost(g, "Priya");
    W.raw.prepare("INSERT INTO organizer_key(hash,org,kind,label,created_ms,host_id,email_sealed,pii,revoked) SELECT 'dev'||hash,org,'host','device',created_ms,hash,'x-sealed','y-sealed',0 FROM organizer_key WHERE scope_eid=?").run(g.id); // a row of the same Host that holds details
    const ask = await call("POST", `/api/z/${g.id}/v2/host/handover`, { note: "please" }, keyH(h)); expect(ask.status).toBe(200);
    const list = await j(await call("GET", `/api/z/${g.id}/v2/host/requests`, undefined, keyH(g.key))); const id = (list.requests ?? list)[0].id;
    const ok = await call("POST", `/api/z/${g.id}/v2/host/requests/${id}`, { approve: true }, keyH(g.key)); expect(ok.status).toBe(200);
    const old = q("SELECT revoked, email_sealed, pii FROM organizer_key WHERE hash LIKE 'dev%'") as any[];
    expect(old[0].revoked).toBe(1); expect(old[0].email_sealed).toBeNull(); expect(old[0].pii).toBeNull();
  });
});

describe("the rejection reason is for people with a key", () => {
  test("an anonymous prize hand-over gets no reason; a keyed one still does", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 2); const host = await labelHost(g);
    W.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").run(g.id, `${seats[0]}x${"ab".repeat(6)}`, "top", 1, 11, T);
    winner(g.id, "top", 1, seats[0]!);
    W.raw.prepare("INSERT INTO prize(eid,round,pattern,ordinal,seat) VALUES(?,?,?,?,?)").run(g.id, 1, "top", 1, seats[0]);
    expect((await call("POST", `/api/z/${g.id}/v2/claimreview/mode`, { on: true }, keyH(g.key))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/v2/claimreview`, { round: 1, pattern: "top", ticket: seats[0], decision: "reject", reason: "Not Ravi Kumars ticket" }, keyH(host))).status).toBe(200);
    const body = { round: 1, pattern: "top", ordinal: 1, seat: seats[0], given: true };
    const anon = await call("POST", `/api/z/${g.id}/prizegiven`, body, {}); const t = JSON.stringify(await j(anon));
    expect(anon.status).toBeGreaterThanOrEqual(400); expect(anon.status).not.toBe(409); expect(t).not.toContain("Ravi");
    const keyed = await call("POST", `/api/z/${g.id}/prizegiven`, body, keyH(host)); expect(keyed.status).toBe(409); expect((await j(keyed)).error).toContain("Ravi");
  });
});
