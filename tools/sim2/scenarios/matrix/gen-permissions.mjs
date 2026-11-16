// Family "permissions": the FULL PERMISSION AND STATE MATRIX as API-level scenario tests (no browser, no phones, no game play).
// Every route of apps/edge/src/worker.ts (and the files it hands to: people, credit, pay, paylink, hostsetup, partners, helpdesk, admin, mode, checkin, rights, winners, lifecycle) is crossed with
//   ACTOR (anonymous, ticket holder, ticket without device proof, level-1 guest, level-2 guest, Co-host accepted / not accepted / of another game, Host ready / first-open unfinished / through an AI work link,
//          Organizer, Organizer of ANOTHER account, platform key, AI key, expired / revoked / made-up key)
//   GAME STATE (draft, published unpaid, paid before start, in the hold window, running auto, running manual, paused, ended, cancelled, reopened, erased, over cap, waiting room not empty, did not start)
//   METHOD (right method, wrong method, OPTIONS).
// ORACLE = the permission matrix of docs/flow/02-roles-console-permissions.md (section 5.1, rows M01..M118) together with docs/dev/05-ROLES-AND-PERMISSIONS.md and the code (can / canAi / deny / mayPay gates).
// Per cell the checks are: (1) the status class the matrix names, (2) a refusal is a short plain sentence (no codes, no stack), (3) a refusal leaks no other person's / account's data,
// (4) a refused call changed nothing (a SQL fingerprint of the game, the people, the keys and the money is equal before and after), (5) no 5xx (the runner adds that one for every call).
// Honest limits: the platform key is never used to run an owner action with a global effect (site off, mode switch, purge, tick, notices, commission): those are only called with a body that must be refused.
// Time-moving states run in their own group, one after the other, the clock is put back between groups (run-permissions.ts).
import { createHash } from "node:crypto";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------- states
// pay: paid, pubd: published, started: first number could have been called, cancelled / dns / erased as named.
const ST = {
  draft:     { },
  pub:       { pubd: true },
  paid:      { pubd: true, pay: true },
  overcap:   { pubd: true, pay: true, cap: 3 },
  waiting:   { pubd: true, pay: true, list: true },
  cancelled: { pubd: true, pay: true, cancelled: true },
  reopened:  { pubd: true, pay: true, cancelled: true, reopen: true },
  erased:    { pubd: true, pay: true, erased: true },
  hold:      { pubd: true, time: "hold" },
  runA:      { pubd: true, pay: true, time: "run", started: true },
  runM:      { pubd: true, pay: true, time: "run", started: true, manual: true },
  paused:    { pubd: true, pay: true, time: "run", started: true, pause: true },
  ended:     { pubd: true, pay: true, time: "end", started: true, ended: true },
  dns:       { pubd: true, time: "dns", dns: true },
};
const STATE_ORDER = ["draft", "pub", "paid", "overcap", "waiting", "cancelled", "reopened", "erased", "hold", "runA", "runM", "paused", "ended", "dns"];
const PAIDISH = (s) => !!ST[s].pay && !ST[s].dns;

// actor codes
const KEYACTORS = ["ORG", "HOST", "HOSTL", "HOSTN", "COH", "COHN", "COHY", "AI", "PLAT", "ORGX", "ORGXAI", "BAD"];
const TICKETACTORS = ["PART", "PARTX", "G1", "G2"];
const ALL_ACTORS = ["ANON", ...TICKETACTORS, ...KEYACTORS];
const LATE_ACTORS = ["AIEXP", "AIREV", "MASTREV", "COHREV", "HOSTREV", "HOSTEXP", "AI", "ORG"];
const MID_ACTORS = ["ANON", "PART", "PARTX", "G2", "COH", "COHN", "HOST", "HOSTN", "ORG", "ORGX", "AI", "PLAT"];
const ACTOR_NAME = { ANON: "anonymous", PART: "ticket holder", PARTX: "ticket without device proof", G1: "level-1 guest", G2: "level-2 guest", COH: "Co-host (accepted)", COHN: "Co-host (K5 not accepted)", COHY: "Co-host of another game",
  HOST: "Host (setup finished)", HOSTN: "Host (first open unfinished)", HOSTL: "Host via AI work link", ORG: "Organizer", ORGX: "Organizer of another account", ORGXAI: "AI key of another account", PLAT: "platform owner key", AI: "AI key", BAD: "made-up key",
  AIEXP: "expired AI key", AIREV: "revoked AI key", MASTREV: "revoked Organizer key", COHREV: "retired Co-host key", HOSTREV: "retired Host key", HOSTEXP: "expired 24-hour Host key", PARTNER: "partner key" };

// ---------------------------------------------------------------- the matrix of routes
// A: who is allowed (M Organizer, H Host console, HL Host via AI link, C Co-host of THIS game after K5, AI the AI key, P platform key). pub: public (anybody, subject to state). tk: ticket routes (pid + device).
// mut: changes data; destr: changes the world for every later cell (run on a private world, last); soft: any non-denied answer is fine; lock: states where an allowed caller must be refused (business 4xx).
// inCancelled / inDns: the route is still open on a cancelled / did-not-start game. hnOk: reachable by an unfinished Host. coOk: reachable by a Co-host before K5. early: runs before the Co-host consent gate (gap G3).
// kind "z": per game; "acct": account level; "owner": platform only; "pubglobal": public outside a game.
const J = (o) => ({ A: "", ...o });
const Z = (w, p) => `/api/z/${w.eid}${p}`;
const ROUTES = [
  // ---- one game, Organizer-side
  J({ id: "summary", kind: "z", m: "GET", p: (w) => Z(w, "/summary"), A: "M H HL AI P", core: 1 }),
  J({ id: "participants", kind: "z", m: "GET", p: (w) => Z(w, "/participants"), A: "M H HL AI P", core: 1 }),
  J({ id: "names", kind: "z", m: "GET", p: (w) => Z(w, "/names?pids=" + w.pidsParam), A: "M H P", core: 1 }),
  J({ id: "claims-read", kind: "z", m: "GET", p: (w) => Z(w, "/claims"), A: "M H AI P" }),
  J({ id: "life", kind: "z", m: "GET", p: (w) => Z(w, "/life"), A: "M H HL AI P", core: 1 }),
  J({ id: "prizes", kind: "z", m: "GET", p: (w) => Z(w, "/prizes"), A: "M H HL AI P" }),
  J({ id: "prizegiven", kind: "z", m: "POST", p: (w) => Z(w, "/prizegiven"), b: (w) => ({ seat: 1, round: 1, pattern: "early5", ordinal: 1, given: true }), A: "M H HL AI P", mut: 1, soft: 1 }),
  J({ id: "reportlink-read", kind: "z", m: "GET", p: (w) => Z(w, "/reportlink"), A: "M H HL AI P", core: 1 }),
  J({ id: "reportlink-new", kind: "z", m: "POST", p: (w) => Z(w, "/reportlink"), b: () => ({}), A: "M H P", mut: 1 }),
  J({ id: "announce", kind: "z", m: "POST", p: (w) => Z(w, "/announce"), b: (w) => ({ text: "Tea and snacks at 6:45 pm" }), A: "M H HL AI P", mut: 1, soft: 1, lock: ["draft"], core: 1 }),
  J({ id: "presence", kind: "z", m: "GET", p: (w) => Z(w, "/presence"), A: "M H AI P" }),
  J({ id: "settings", kind: "z", m: "PATCH", p: (w) => Z(w, "/settings"), b: (w) => ({ name: "Renamed " + w.n() }), A: "M H AI P", mut: 1, lock: ["hold", "runA", "runM", "paused", "ended", "dns"], core: 1 }),
  J({ id: "settings-post", kind: "z", m: "POST", p: (w) => Z(w, "/settings"), b: (w) => ({ name: "Renamed " + w.n() }), A: "M H AI P", mut: 1, lock: ["hold", "runA", "runM", "paused", "ended", "dns"] }),
  J({ id: "publish", kind: "z", m: "POST", p: (w) => Z(w, "/publish"), b: (w) => ({ email: w.org.email, phone: "9811122233" }), A: "M H AI P", mut: 1, destr: 1, soft: 1, core: 1 }),
  J({ id: "unbind", kind: "z", m: "POST", p: (w) => Z(w, "/unbind"), b: (w) => ({ seat: 999 }), A: "M H AI P", mut: 1, soft: 1 }),
  J({ id: "mark", kind: "z", m: "POST", p: (w) => Z(w, "/mark"), b: (w) => ({ seat: w.seatOfPart || 1, role: "none" }), A: "M H AI P", mut: 1, soft: 1, lock: ["runA", "runM", "paused", "ended"] }),
  J({ id: "roster", kind: "z", m: "POST", p: (w) => Z(w, "/roster"), b: (w) => ({ people: [{ name: "Asha Rao", phone: w.freshPhone() }] }), A: "M H P", mut: 1, soft: 1 }),
  J({ id: "reuse", kind: "z", m: "POST", p: (w) => Z(w, "/reuse"), b: (w) => ({ from: w.eid2 }), A: "M H AI P", mut: 1, soft: 1 }),
  J({ id: "erase", kind: "z", m: "POST", p: (w) => Z(w, "/erase"), b: () => ({}), A: "M H P", mut: 1, destr: 1, inCancelled: 1, inDns: 1, lock: ["runA", "runM", "paused"], core: 1 }), // G15: the matrix says a running game must refuse like forget
  J({ id: "discard", kind: "z", m: "POST", p: (w) => Z(w, "/discard"), b: () => ({}), A: "M P", mut: 1, destr: 1, lock: ["pub", "paid", "overcap", "waiting", "cancelled", "reopened", "erased", "hold", "runA", "runM", "paused", "ended", "dns"] }),
  J({ id: "person", kind: "z", m: "POST", p: (w) => Z(w, "/person"), b: () => ({ phone: "9000000001" }), A: "M H P", mut: 0, soft: 1, inCancelled: 1, inDns: 1 }),
  J({ id: "forget", kind: "z", m: "POST", p: (w) => Z(w, "/forget"), b: () => ({ phone: "9000000001" }), A: "M H P", mut: 1, soft: 1, inCancelled: 1, inDns: 1 }),
  J({ id: "cancel-preview", kind: "z", m: "GET", p: (w) => Z(w, "/cancel-preview"), A: "M H P", core: 1 }),
  J({ id: "cancel", kind: "z", m: "POST", p: (w) => Z(w, "/cancel"), b: () => ({ confirmations: 3 }), A: "M H P", mut: 1, destr: 1, inCancelled: 1, inDns: 1, lock: ["runA", "runM", "paused", "ended", "dns"], core: 1 }),
  J({ id: "cancel-short", kind: "z", m: "POST", p: (w) => Z(w, "/cancel"), b: () => ({ confirmations: 1 }), A: "M H P", mut: 1, inCancelled: 1, inDns: 1, lock: ["draft", "pub", "paid", "overcap", "waiting", "cancelled", "reopened", "erased", "hold", "runA", "runM", "paused", "ended", "dns"] }), // one confirmation is never enough
  J({ id: "reopen", kind: "z", m: "POST", p: (w) => Z(w, "/reopen"), b: (w) => ({ startRound: w.futureRound }), A: "M H P", mut: 1, destr: 1, inCancelled: 1, lock: ["draft", "pub", "paid", "overcap", "waiting", "reopened", "erased", "hold", "runA", "runM", "paused", "ended", "dns"] }),
  J({ id: "clone", kind: "z", m: "POST", p: (w) => Z(w, "/clone"), b: () => ({}), A: "M H P", mut: 1, soft: 1, inCancelled: 1, inDns: 1, core: 1 }),
  J({ id: "cohost-header", kind: "z", m: "GET", p: (w) => Z(w, "/cohost"), A: "M H AI C P", coOk: 1, core: 1 }),
  J({ id: "paylink", kind: "z", m: "POST", p: (w) => Z(w, "/paylink"), b: () => ({}), A: "M H C", mut: 1, soft: 1, lock: ["paid", "overcap", "waiting", "cancelled", "reopened", "erased", "runA", "runM", "paused", "ended", "dns"], core: 1 }),
  J({ id: "pay-with-credit", kind: "z", m: "POST", p: (w) => Z(w, "/pay-with-credit"), b: () => ({}), A: "M H C", mut: 1, soft: 1, early: 1, core: 1 }),
  J({ id: "checkout", kind: "z", m: "POST", p: () => "/api/checkout", b: (w, a) => ({ eid: w.eid, email: ["ORG", "HOST", "COH"].includes(a.code) ? w.org.email : "stranger@example.com", org: "Kaveri Foods", country: "IN", pack: 100 }), A: "M H C", mut: 1, destr: 1, soft: 1, early: 1, anyoneMay: 1, isolate: 1, watch: 1 }),
  J({ id: "pay-test", kind: "z", m: "POST", p: () => "/api/payments/test", b: (w, a) => ({ eid: w.eid, email: ["ORG", "HOST", "COH"].includes(a.code) ? w.org.email : "stranger@example.com", org: "Kaveri Foods", country: "IN", pack: 100 }), A: "M H C", mut: 1, destr: 1, soft: 1, early: 1, core: 1, anyoneMay: 1, isolate: 1, watch: 1 }),
  // ---- control (pause file): GET is public, POST needs a signature, the rest are team routes
  J({ id: "control-read", kind: "z", m: "GET", p: (w) => Z(w, "/control"), pub: 1, soft: 1, noPlain: 1 }),
  J({ id: "control-post-unsigned", kind: "z", m: "POST", p: (w) => Z(w, "/control"), b: (w) => ({ message: { engagementId: w.eid, seq: 1, action: "pause", atBeaconRound: 1, signedAtRound: 1, sig: "00".repeat(64) } }), pub: 1, soft: 1, refuseAll: 1 }),
  J({ id: "control-key", kind: "z", m: "PUT", p: (w) => Z(w, "/control/key"), b: (w) => ({ publicKey: w.pubKey }), A: "M H P", mut: 1, soft: 1 }),
  J({ id: "control-request", kind: "z", m: "POST", p: (w) => Z(w, "/control/request"), b: () => ({ action: "pause", note: "fire drill" }), A: "M H AI P", mut: 1, soft: 1 }),
  J({ id: "control-request-read", kind: "z", m: "GET", p: (w) => Z(w, "/control/request"), A: "M H AI P" }),
  J({ id: "control-request-clear", kind: "z", m: "POST", p: (w) => Z(w, "/control/request/clear"), b: () => ({}), A: "M H P", mut: 1 }),
  // ---- people, waiting room (Organizer, Host, Co-host own list, level-1 guest own list)
  J({ id: "people-read", kind: "z", m: "GET", p: (w) => Z(w, "/people"), A: "M H C P G", core: 1 }),
  J({ id: "people-add", kind: "z", m: "POST", p: (w) => Z(w, "/people"), b: (w) => ({ people: [{ name: "Ravi Menon", phone: w.freshPhone() }] }), A: "M H C P G", mut: 1, soft: 1, lock: ["ended"], core: 1 }),
  J({ id: "people-export", kind: "z", m: "GET", p: (w) => Z(w, "/people/export"), A: "M H P" }),
  J({ id: "people-me", kind: "z", m: "GET", p: (w) => Z(w, "/people/me"), A: "M H C P", soft: 1 }),
  J({ id: "people-remove", kind: "z", m: "POST", p: (w) => Z(w, "/people/zzzzzzzzzzzz/remove"), b: () => ({}), A: "M H C P G", mut: 1, soft: 1 }),
  J({ id: "people-resend", kind: "z", m: "POST", p: (w) => Z(w, "/people/zzzzzzzzzzzz/resend"), b: () => ({}), A: "M H C P G", mut: 1, soft: 1 }),
  J({ id: "waiting-read", kind: "z", m: "GET", p: (w) => Z(w, "/waiting"), A: "M H C P G", core: 1 }),
  J({ id: "waiting-decide", kind: "z", m: "POST", p: (w) => Z(w, "/waiting/" + (w.waitingId || "zzzzzzzzzzzz")), b: () => ({ decision: "decline" }), A: "M H C P G", mut: 1, soft: 1 }),
  J({ id: "waiting-all", kind: "z", m: "POST", p: (w) => Z(w, "/waiting/all"), b: () => ({ decision: "decline" }), A: "M H C P G", mut: 1, soft: 1, destrW: 1 }),
  // ---- phones (public with the ticket)
  J({ id: "info", kind: "z", m: "GET", p: (w) => Z(w, "/info"), pub: 1, draftManage: 1, core: 1 }),
  J({ id: "results", kind: "z", m: "GET", p: (w) => Z(w, "/results"), pub: 1 }),
  J({ id: "seats", kind: "z", m: "GET", p: (w) => Z(w, "/seats"), pub: 1, lockPub: ["draft"] }),
  J({ id: "join", kind: "z", m: "POST", p: (w) => Z(w, "/join"), b: (w, a) => ({ phone: w.freshPhone(), name: "New Joiner", device: w.freshDevice() }), pub: 1, mut: 1, soft: 1, lockPub: ["draft", "cancelled", "dns"] }),
  J({ id: "who", kind: "z", m: "POST", p: (w) => Z(w, "/who"), b: () => ({ empId: "E1001" }), pub: 1, mut: 0, soft: 1, lockPub: ["draft"] }),
  J({ id: "invites", kind: "z", m: "GET", p: (w, a) => Z(w, "/invites?pid=" + (a.pid || w.phantom)), pub: 1, tk: 1, soft: 1 }),
  J({ id: "me", kind: "z", m: "GET", p: (w, a) => Z(w, "/me?pid=" + (a.pid || w.phantom)), pub: 1, tk: 1, soft: 1 }),
  J({ id: "claims", kind: "z", m: "POST", p: (w) => Z(w, "/claims"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev, claims: [{ pattern: "early5", idx: 3, round: 1 }] }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1, core: 1 }),
  J({ id: "bogey", kind: "z", m: "POST", p: (w) => Z(w, "/bogey"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev, pattern: "early5", round: 1 }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1 }),
  J({ id: "vote", kind: "z", m: "POST", p: (w) => Z(w, "/vote"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev, results: [{ pattern: "early5", ordinal: 1, round: 1, idx: 3, pids: [a.pid || w.partPid] }] }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1 }),
  J({ id: "confirm", kind: "z", m: "POST", p: (w) => Z(w, "/confirm"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev || w.freshDevice(), name: "Win Ner", phone: "9811100011" }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1 }),
  J({ id: "myprizes", kind: "z", m: "GET", p: (w, a) => Z(w, `/myprizes?pid=${a.pid || w.partPid}&device=${a.dev || w.freshDevice()}`), pub: 1, tk: 1, soft: 1, devRoute: 1 }),
  J({ id: "over", kind: "z", m: "POST", p: (w) => Z(w, "/over"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1 }),
  J({ id: "won", kind: "z", m: "POST", p: (w) => Z(w, "/won"), b: () => ({ pid: "1x000000000000" }), pub: 1, soft: 1 }),
  J({ id: "settle", kind: "z", m: "POST", p: (w) => Z(w, "/settle"), b: () => ({}), pub: 1, refuseAll: 1 }),
  J({ id: "datareq-status", kind: "z", m: "POST", p: (w) => Z(w, "/datareq"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev || w.freshDevice(), kind: "status" }), pub: 1, tk: 1, soft: 1, devRoute: 1, inCancelled: 1, inDns: 1 }),
  J({ id: "leave", kind: "z", m: "POST", p: (w) => Z(w, "/leave"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev || w.freshDevice() }), pub: 1, tk: 1, mut: 1, destr: 1, soft: 1, devRoute: 1, inCancelled: 1, inDns: 1 }),
  J({ id: "checkin-read", kind: "z", m: "GET", p: (w, a) => Z(w, `/checkin?pid=${a.pid || w.partPid}&device=${a.dev || w.freshDevice()}`), pub: 1, tk: 1, soft: 1, devRoute: 1 }),
  J({ id: "checkin-post", kind: "z", m: "POST", p: (w) => Z(w, "/checkin"), b: (w, a) => ({ pid: a.pid || w.partPid, device: a.dev || w.freshDevice(), code: "0000", confirmName: true, confirmMobile: true }), pub: 1, tk: 1, mut: 1, soft: 1, devRoute: 1 }),

  // ---- account level
  J({ id: "whoami", kind: "acct", m: "GET", p: () => "/api/whoami", A: "M H HL AI P C", hnOk: 1, coOk: 1, core: 1 }),
  J({ id: "history", kind: "acct", m: "GET", p: () => "/api/history", A: "M H AI P" }),
  J({ id: "create-game", kind: "acct", m: "POST", p: () => "/api/z", b: (w) => ({ id: w.newId(), startRound: w.futureRound, callSeconds: 9, cap: 30 }), A: "M AI P", mut: 1 }),
  J({ id: "org-ai-link", kind: "acct", m: "GET", p: () => "/api/org/ai/link", A: "M" }),
  J({ id: "org-ai-fresh", kind: "acct", m: "POST", p: () => "/api/org/ai/fresh", b: () => ({}), A: "M", mut: 1 }),
  J({ id: "org-ai-replace", kind: "acct", m: "POST", p: () => "/api/org/ai/replace", b: () => ({}), A: "M", mut: 1, destr: 1 }),
  J({ id: "org-ai-replace2", kind: "acct", m: "POST", p: () => "/api/org/ai", b: () => ({}), A: "M", mut: 1, destr: 1 }),
  J({ id: "org-ai-revoke", kind: "acct", m: "POST", p: () => "/api/org/ai/revoke", b: () => ({}), A: "M", mut: 1, destr: 1 }),
  J({ id: "org-ai-audit", kind: "acct", m: "GET", p: () => "/api/org/ai/audit", A: "M AI P" }),
  J({ id: "org-keys", kind: "acct", m: "GET", p: () => "/api/org/keys", A: "M" }),
  J({ id: "org-keys-revoke", kind: "acct", m: "POST", p: () => "/api/org/keys/revoke", b: () => ({ id: "0123456789" }), A: "M", mut: 1, soft: 1 }),
  J({ id: "org-close-unconfirmed", kind: "acct", m: "POST", p: () => "/api/org/close", b: () => ({}), A: "M", mut: 1, lock: ["*"] }), // allowed callers get 400 "Please confirm"
  J({ id: "org-close", kind: "acct", m: "POST", p: () => "/api/org/close", b: () => ({ confirm: true }), A: "M", mut: 1, destr: 1, lastOfAll: 1 }),
  J({ id: "org-host-add", kind: "acct", m: "POST", p: (w) => "/api/org/host", b: (w) => ({ label: "Sunita", email: w.freshEmail(), mobile: w.freshPhone() }), A: "M", mut: 1, destr: 1 }),
  J({ id: "org-host-link", kind: "acct", m: "POST", p: () => "/api/org/host/link", b: (w) => ({ id: w.hostNId }), A: "M", mut: 1, soft: 1, destr: 1, names: 1 }),
  J({ id: "org-team", kind: "acct", m: "GET", p: () => "/api/org/team", A: "M H AI", core: 1 }),
  J({ id: "org-cohost-add", kind: "acct", m: "POST", p: (w) => "/api/org/cohost", b: (w) => ({ label: "Dev Kapoor", phone: w.freshPhone(), e: w.eid }), A: "M H", mut: 1, soft: 1, names: 1 }),
  J({ id: "org-team-retire", kind: "acct", m: "POST", p: () => "/api/org/team/retire", b: (w) => ({ id: "0123456789" }), A: "M H", mut: 1, soft: 1 }),
  J({ id: "org-credit", kind: "acct", m: "GET", p: () => "/api/org/credit", A: "M H", early: 1 }),
  J({ id: "org-role-accept", kind: "acct", m: "POST", p: () => "/api/org/role/accept", b: () => ({}), A: "H C", mut: 1, soft: 1, coOk: 1, hnOk: 0 }),
  J({ id: "host-setup", kind: "acct", m: "GET", p: () => "/api/host/setup", A: "H", hnOk: 1 }),
  J({ id: "host-setup-mobile", kind: "acct", m: "POST", p: () => "/api/host/setup/mobile", b: () => ({ mobile: "123" }), A: "H", hnOk: 1, mut: 1, soft: 1 }),
  J({ id: "host-become-organizer", kind: "acct", m: "POST", p: () => "/api/host/become-organizer", b: () => ({}), A: "H", mut: 1, soft: 1 }),
  J({ id: "pass", kind: "acct", m: "POST", p: () => "/api/pass", b: () => ({ token: "0".repeat(32) }), A: "M", mut: 1, soft: 1 }),
  J({ id: "org-create", kind: "acct", m: "POST", p: () => "/api/org", b: () => ({}), A: "P", mut: 1, destr: 1 }),
  J({ id: "suggestions-read", kind: "acct", m: "GET", p: () => "/api/z/suggestions", A: "M H AI P" }),
  J({ id: "suggestions-add", kind: "acct", m: "POST", p: (w) => "/api/z/suggestions", b: (w) => ({ kind: "improvement", title: "Bigger tickets " + w.n(), body: "Please make the numbers on the ticket a little bigger for older guests." }), A: "M H AI", mut: 1, soft: 1 }),
  J({ id: "suggestions-status", kind: "acct", m: "POST", p: () => "/api/z/suggestions/1/status", b: () => ({ status: "planned" }), A: "P", mut: 1, soft: 1 }),
  J({ id: "proforma", kind: "acct", m: "POST", p: () => "/api/proforma", b: (w) => ({ eid: w.eid, pack: 100, email: "a@example.com", name: "Ab Cd" }), A: "M H C", early: 1, soft: 1, pubAcct: 1, names: 1 }),
  // ---- public outside a game
  J({ id: "manifest", kind: "acct", m: "GET", p: () => "/api/z/ai-manifest", pub: 1, early: 1 }),
  J({ id: "notices-read", hnOk: 1, kind: "acct", m: "GET", p: () => "/api/notices", pub: 1, coOk: 1 }),
  J({ id: "notices-write", kind: "acct", m: "POST", p: () => "/api/notices", b: () => ({ notices: "x" }), A: "P", mut: 1, soft: 1, platBad: 1 }),
  J({ id: "mode-read", kind: "acct", m: "GET", p: () => "/api/mode", pub: 1, early: 1 }),
  J({ id: "health", kind: "acct", m: "GET", p: () => "/api/status/health", pub: 1, early: 1 }),
  J({ id: "pay-status", kind: "acct", m: "GET", p: () => "/api/payments/status", pub: 1, early: 1 }),
  J({ id: "auth-config", hnOk: 1, kind: "acct", m: "GET", p: () => "/api/auth/config", pub: 1 }),
  J({ id: "schedule", anyPub: 1, kind: "acct", m: "GET", p: () => "/api/z/schedule?at=2031-01-01T10:00:00%2B05:30", pub: 1, soft: 1 }),
  J({ id: "beacon-unknown", anyPub: 1, kind: "acct", m: "GET", p: () => "/api/beacon/" + "0".repeat(64) + "/public/latest", pub: 1, early: 1, soft: 1 }),
  J({ id: "visit-beacon", noPlain: 1, kind: "acct", m: "POST", p: () => "/api/v/b", b: () => ({}), pub: 1, early: 1, soft: 1, noteSkip: 1 }),
  J({ id: "report-wrong-key", anyPub: 1, kind: "acct", m: "GET", p: (w) => `/api/report/${w.eid}?k=wrong`, pub: 1, early: 1, soft: 1 }),
  J({ id: "auth-start-bad", hnOk: 1, kind: "acct", m: "POST", p: () => "/api/start", b: () => ({ email: "not-an-address" }), pub: 1, soft: 1 }),
  J({ id: "auth-email-bad", hnOk: 1, kind: "acct", m: "POST", p: () => "/api/auth/email", b: () => ({ email: "x" }), pub: 1, soft: 1 }),
  J({ id: "auth-verify-bad", hnOk: 1, kind: "acct", m: "POST", p: () => "/api/auth/verify", b: () => ({ email: "nobody@example.com", code: "000000" }), pub: 1, soft: 1 }),
  J({ id: "auth-link-bad", hnOk: 1, kind: "acct", m: "POST", p: () => "/api/auth/link", b: () => ({ token: "0".repeat(48) }), pub: 1, soft: 1 }),
  J({ id: "auth-google-bad", hnOk: 1, kind: "acct", m: "POST", p: () => "/api/auth/google", b: () => ({ intent: "signin", credential: "x" }), pub: 1, soft: 1 }),
  J({ id: "paylink-token-read", anyPub: 1, hnOk: 1, kind: "acct", m: "GET", p: () => "/api/paylink/" + "0".repeat(48), pub: 1, early: 1, soft: 1 }),
  J({ id: "paylink-token-pay", anyPub: 1, hnOk: 1, kind: "acct", m: "POST", p: () => "/api/paylink/" + "0".repeat(48) + "/checkout", b: () => ({ email: "a@example.com", org: "X" }), pub: 1, early: 1, soft: 1 }),
  J({ id: "invoice-token", anyPub: 1, kind: "acct", m: "GET", p: () => "/api/invoice/inv_" + "0".repeat(32), pub: 1, early: 1, soft: 1 }),
  J({ id: "credit-note-token", anyPub: 1, kind: "acct", m: "GET", p: () => "/api/credit-note/cn_" + "0".repeat(32), pub: 1, early: 1, soft: 1 }),
  J({ id: "partner-check", anyPub: 1, kind: "acct", m: "GET", p: () => "/api/partner/check?code=zzzzzz", pub: 1, soft: 1 }),
  J({ id: "partner-me", kind: "acct", m: "GET", p: () => "/api/partner/me", A: "", soft: 1 }),
  J({ id: "partners-list", kind: "acct", m: "GET", p: () => "/api/partners", A: "P" }),
  J({ id: "partners-rate", kind: "acct", m: "POST", p: () => "/api/partners/commission/rate", b: () => ({ rate: 7 }), A: "P", mut: 1, platBad: 1 }),
  J({ id: "helpdesk-me", kind: "acct", m: "GET", p: () => "/api/helpdesk/me", A: "", soft: 1 }),
  J({ id: "helpdesk-invite", kind: "acct", m: "POST", p: () => "/api/helpdesk/invite", b: () => ({ email: "x@example.com" }), A: "", soft: 1 }),
  J({ id: "inbound-email", kind: "acct", m: "POST", p: () => "/api/inbound-email", b: () => ({ from: "a@example.com", subject: "delete", text: "delete" }), A: "", soft: 1 }),
  J({ id: "payments-verify", kind: "acct", m: "POST", p: () => "/api/payments/verify", b: () => ({ order: "x" }), pub: 1, early: 1, soft: 1, refuseAll: 1 }),
  // ---- the owner routes (404 for everybody but the platform key)
  ...[
    ["owner-game-records", "GET", "/api/owner/game-records"], ["owner-releases", "GET", "/api/owner/releases"], ["owner-ledger", "GET", "/api/owner/ledger"], ["owner-visits-summary", "GET", "/api/owner/visits/summary"],
    ["owner-visits-journey", "GET", "/api/owner/visits/journey/" + "a".repeat(32)], ["owner-audit-access", "GET", "/api/owner/audit/access"], ["owner-audit-chain", "GET", "/api/owner/audit/sys"],
    ["owner-audit-verify", "GET", "/api/owner/audit/sys/verify"], ["owner-site-read", "GET", "/api/owner/site"], ["owner-organizer", "GET", "/api/owner/organizer?email=nobody@example.com"], ["owner-data-requests", "GET", "/api/owner/data-requests"],
    ["owner-mail-events", "GET", "/api/owner/mail-events"], ["owner-errors", "GET", "/api/owner/errors"], ["owner-mode-read", "GET", "/api/owner/mode"], ["owner-test-mail-read", "GET", "/api/owner/test-mail"],
  ].map(([id, m, p]) => J({ id, kind: "owner", m, p: () => p, A: "P", platAny: ["owner-organizer", "owner-visits-journey", "owner-audit-verify", "owner-audit-chain"].includes(id) ? 1 : 0 })),
  ...[
    ["owner-site-set", "POST", "/api/owner/site", { off: "maybe" }], ["owner-mode-set", "POST", "/api/owner/mode", { mode: "MAYBE" }], ["owner-purge-test", "POST", "/api/owner/purge-test-data", { confirm: "no" }],
    ["owner-audit-hold", "POST", "/api/owner/audit/sys/hold", { on: false }], ["owner-data-request-close", "POST", "/api/owner/data-requests", { id: "x" }],
    ["lifecycle-tick", "POST", "/api/lifecycle/tick", {}], ["purge-all", "POST", "/api/purge", {}],
  ].map(([id, m, p, b]) => J({ id, kind: "owner", m, p: () => p, b: () => b, A: "P", mut: 1, platBad: id !== "owner-audit-hold" ? 1 : 0, platAny: id === "owner-audit-hold" ? 1 : 0, platSkip: id === "lifecycle-tick" || id === "purge-all" })),
];
// who is "G" (level-1 guest with a device, invites on): only the people routes
const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
// the dummy world lets every route say what its address looks like, so the oracle can read the game action out of it
const DUMMY = new Proxy({}, { get: () => { const f = () => "X"; f.toString = () => "X"; f[Symbol.toPrimitive] = () => "X"; return f; } });
const MAIN_ACTIONS = new Set("join claims bogey settle results info participants erase discard reuse roster settings publish summary announce unbind seats names mark won over invites life vote confirm prizes prizegiven myprizes reportlink person forget cohost cancel-preview cancel reopen clone leave datareq checkin presence who".split(" "));
const HOST_ACTIONS = new Set("participants summary results info announce prizes prizegiven reportlink life".split(" "));
for (const r of ROUTES) { try { r.path0 = r.p(DUMMY, DUMMY); } catch { r.path0 = ""; } r.action = /^\/api\/z\/X\/([a-z-]+)/.exec(r.path0)?.[1] ?? null; }

// ---------------------------------------------------------------- the oracle
const DENY_RE = /^(Not allowed|Not found|Only the Organizer|Only the owner|Once the game has started only|Your ticket link is the one|This report link is not valid|A Co-host can invite people and pay|Your AI assistant may not do this|No such engagement|Please sign in|Please finish your setup|A Host's AI assistant cannot|Your Co-host link is for a different game|Names and mobile numbers|A Host needs|A Co-host needs|A pay link is for people|Paying is for people|Credit is shown|Not a participant|Please tick the box|Open this ticket|This is not the phone|This ticket belongs to another phone|Guests invited by a guest|Your team seat|The organizer has not switched on)/i;
const isDenied = (r) => r.status === 401 || ((r.status === 403 || r.status === 404 || r.status === 400) && (DENY_RE.test(String(r.body?.error ?? "")) || r.body?.code === "host-setup" || r.body?.code === "ai-not-allowed" || r.body?.code === "consent-required" || (r.status !== 400 && /^(Not found\.?)$/.test(String(r.body?.text ?? "")))));
const isBiz = (r) => r.status >= 400 && r.status < 500 && !isDenied(r);

function letterOf(code) { return { ORG: "M", HOST: "H", HOSTL: "HL", COH: "C", AI: "AI", PLAT: "P" }[code] ?? null; }
const DEAD_COHOST_STATES = new Set(["cancelled", "reopened", "erased", "dns"]); // a Co-host's key goes with the guests' data (cancel.ts eraseCohostsSql)

/** The expected answer class for (route, actor, state): ok (2xx), pass (anything but a permission denial / 5xx), biz (a business refusal: 4xx), deny (a permission denial), refuse (any 4xx), any (no 5xx). */
function expectOf(r, a, st) {
  let c = a.code;
  if ((st === "erased" || st === "dns") && a.hasTicket) a = { ...a, hasTicket: false, devOk: false }; // the tickets were erased with the guests' data
  // an account-level route is about the caller's OWN account: another account's Organizer / AI key is a normal Organizer / AI key there
  if (r.kind === "acct" || r.kind === "owner") { if (c === "ORGX") { c = "ORG"; if (r.names) return "refuse"; } else if (c === "ORGXAI") { c = "AI"; if (r.names) return "refuse"; } }
  if (DEAD_COHOST_STATES.has(st) && (c === "COH" || c === "COHN" || c === "COHY")) c = "BAD";
  const A = new Set((r.A ?? "").split(/\s+/).filter(Boolean));
  const stateLocked = r.kind === "z" && r.mut && ((st === "cancelled" && !r.inCancelled) || (st === "dns" && !r.inDns));
  const allowedBase = () => {
    if (stateLocked) return "biz";
    if (r.lock && (r.lock.includes(st) || r.lock.includes("*"))) return "biz";
    return r.soft ? "pass" : "ok";
  };
  const denyX = () => (stateLocked ? "refuse" : "deny"); // a cancelled / did-not-start game answers 409 before it looks at who asks
  const asNoKey = () => (r.pub ? pubExpect(r, a, st) : denyX()); // a caller whose key makes no difference on this route
  if (r.refuseAll) return "refuse"; // nobody gets a 2xx here
  if (c === "PLAT" && r.platAny) return "any";
  if (["AIEXP", "AIREV", "MASTREV", "COHREV", "HOSTREV", "HOSTEXP", "BAD"].includes(c)) return r.anyoneMay ? "any" : asNoKey(); // an expired, revoked or made-up key is simply nobody
  // gate 0 (worker.ts:811): an unfinished Host can do nothing but finish the setup
  if (c === "HOSTN") return r.hnOk ? "any" : "refuse";
  // the Co-host gates (worker.ts:855-862); payment and credit routes run BEFORE the K5 gate (gap G3)
  if (c === "COHN") {
    if (r.early) return A.has("C") ? "refuse" : asNoKey();
    return r.coOk ? allowedBase() : "refuse";
  }
  if (c === "COHY") { if (r.names) return denyX(); if (r.kind !== "z" && A.has("C")) return allowedBase(); if (A.has("C") || r.id === "cohost-header") return denyX(); return r.pub ? "any" : denyX(); }
  if (c === "COH") {
    if (A.has("C")) return allowedBase();
    if (r.early) return asNoKey();
    return r.coOk || r.pub ? (r.pub ? "any" : allowedBase()) : denyX();
  }
  if (c === "HOSTL") {
    if (/^\/api\/(payments\/|org\/(team|cohost))/.test(r.path0 ?? "")) return "deny"; // worker.ts:793: a Host work link may not pay or manage the team
    if (r.kind === "z" && r.action && MAIN_ACTIONS.has(r.action) && !HOST_ACTIONS.has(r.action)) return "deny"; // worker.ts:1517: a Host's work link keeps the nine actions only, even on public ones
    if (r.kind === "z" && r.action && HOST_ACTIONS.has(r.action) && r.pub) return "ok";
    return A.has("HL") ? allowedBase() : (r.pub ? asNoKey() : "deny");
  }
  if (r.anyoneMay && !["AI", "ORGX", "ORGXAI"].includes(c) && !(Letter(c) && A.has(Letter(c)))) return "any"; // the public pack-purchase flow: anybody may buy, but the call must never act on THIS account's game
  const Lt = letterOf(c);
  if (Lt && A.has(Lt)) { if (r.platBad && c === "PLAT") return "biz"; return allowedBase(); }
  if (A.has("G") && (c === "G1" || c === "PART")) { if (!a.hasTicket) return denyX(); if (st === "cancelled" || st === "dns") return r.m === "GET" ? "pass" : "biz"; return r.soft ? "pass" : "ok"; }
  return asNoKey();
}
function Letter(c) { return letterOf(c); }
function pubExpect(r, a, st) {
  const c = a.code;
  if (r.anyPub) return "any";
  if (r.tk && r.devRoute) return a.hasTicket && a.devOk ? (r.soft ? "pass" : "ok") : "refuse"; // a ticket id alone (public in the seat list) is never enough
  if (r.tk) return a.hasTicket ? "pass" : "refuse";
  if (r.lockPub && r.lockPub.includes(st)) return "biz";
  if (r.id === "info" && st === "draft" && !["ORG", "HOST", "HOSTL", "AI", "PLAT"].includes(c)) return "biz";
  if (r.mut && st === "cancelled" && !r.inCancelled && r.id !== "join") return "biz";
  return r.soft ? "pass" : "ok";
}

// ---------------------------------------------------------------- the generator
export default async function gen({ seed, R, L }) {
  const { A, clock, MIN, HOUR, DAY, mobile, personName, roundFrom, roundTimeMs, startAt, PLATFORM_KEY, friendly } = L;
  const SIMHOST = "http://localhost:" + (process.env.SIM_PORT ?? 8801);
  const out = [];
  let counter = 0;
  const n = () => ++counter;
  // a private source of fresh phones / devices / e-mails / ids
  const freshPhone = () => mobile(R);
  const freshDevice = () => A.sha("pdev|" + n() + "|" + seed).slice(0, 32);
  const badDevice = () => "f".repeat(32);

  // ---------------------------------------------------------------- worlds
  async function mkGame(t, org, o) {
    const st = await startAt(o.days ?? 6, o.time ?? "19:00");
    const id = t.gid("PM");
    const body = { id, startRound: st.round, callSeconds: 9, cap: o.cap ?? 20, name: o.name ?? "Permission test game", ...(o.list ? { whoCanJoin: "list" } : {}), ...(o.manual ? { callMode: "host" } : {}) };
    const r = await org.api("POST", "/api/z", body);
    if (!r.ok) throw new Error("create game: HTTP " + r.status + " " + JSON.stringify(r.body).slice(0, 200));
    return { id, startRound: st.round, startMs: roundTimeMs(st.round) };
  }
  const SNAP = (eids, org) => {
    const ids = eids.map((e) => `'${e}'`).join(",");
    return `SELECT json_object(
      'eng', (SELECT json_group_array(json_array(id,start_round,call_seconds,cap,closed,pack,tickets,config,cancelled_ms,unplayed_ms,cohost_limit)) FROM (SELECT * FROM engagement WHERE id IN (${ids}) ORDER BY id)),
      'cnt', json_array((SELECT COUNT(*) FROM participant WHERE eid IN (${ids})),(SELECT COUNT(*) FROM seat WHERE eid IN (${ids})),(SELECT COUNT(*) FROM person WHERE eid IN (${ids})),(SELECT COUNT(*) FROM waiting WHERE eid IN (${ids})),
        (SELECT COUNT(*) FROM claim WHERE eid IN (${ids})),(SELECT COUNT(*) FROM bogey WHERE eid IN (${ids})),(SELECT COUNT(*) FROM rvote WHERE eid IN (${ids})),(SELECT COUNT(*) FROM settled WHERE eid IN (${ids})),
        (SELECT COUNT(*) FROM prize WHERE eid IN (${ids})),(SELECT COUNT(*) FROM ctl_request WHERE eid IN (${ids})),(SELECT COUNT(*) FROM payment WHERE eid IN (${ids})),(SELECT COUNT(*) FROM overvote WHERE eid IN (${ids})),
        (SELECT COUNT(*) FROM engagement WHERE org='${org}'),(SELECT COUNT(*) FROM entitlement WHERE org='${org}'),(SELECT COUNT(*) FROM credit WHERE org='${org}'),(SELECT COUNT(*) FROM organizer_email WHERE org='${org}')),
      'seatstate', (SELECT json_group_array(json_array(seq,role,blocked,dev,inv)) FROM (SELECT * FROM seat WHERE eid IN (${ids}) ORDER BY eid,seq)),
      'keys', (SELECT json_group_array(json_array(substr(hash,1,12),kind,revoked,expires_ms,label,eid)) FROM (SELECT * FROM organizer_key WHERE org='${org}' ORDER BY hash)),
      'kv', (SELECT json_group_array(json_array(k,v)) FROM (SELECT * FROM kv WHERE k IN (${eids.flatMap((e) => ["pub/" + e, "control/" + e + ".json", "ann/" + e, "paidby/" + e, "contact/" + e, "rptsalt/" + e, "startpending/" + e]).map((k) => `'${k}'`).join(",")},'aikey/${org}','orgmail/${org}') ORDER BY k)),
      'persons', (SELECT json_group_array(json_array(id,status,inviter,role)) FROM (SELECT * FROM person WHERE eid IN (${ids}) ORDER BY eid,id)),
      'wait', (SELECT json_group_array(json_array(id,status)) FROM (SELECT * FROM waiting WHERE eid IN (${ids}) ORDER BY eid,id))
    ) AS j`;
  };
  async function snapshot(w) {
    try { const rows = await A.sql(SNAP([w.eid, w.eid2].filter(Boolean), w.orgId)); return String(rows[0]?.j ?? ""); } catch (e) { return "snapshot failed: " + (e?.message ?? e); }
  }

  /** Builds the world of one state: an Organizer with a game, a second game, every kind of caller. `need` limits the cast (a private world for one destructive cell). */
  async function build(t, st, need = null) {
    const S = ST[st];
    await clock.reset();
    const want = (c) => !need || need.includes(c);
    const org = await t.newOrg("p");
    const g = await mkGame(t, org, { cap: S.cap ?? 40, days: S.time ? 2 : 6, list: S.list, manual: S.manual });
    const g2 = await mkGame(t, org, { cap: 20, days: 7, name: "Second game" });
    const w = { t, st, S, org, eid: g.id, eid2: g2.id, startMs: g.startMs, startRound: g.startRound, orgId: null, actors: {}, secrets: [], notes: [], n, freshPhone, freshDevice, phantom: "999x000000000000", partPid: "999x000000000000" };
    w.orgId = (await A.sql("SELECT org FROM engagement WHERE id=?", [w.eid]))[0]?.org;
    w.futureRound = roundFrom((await clock.now()) + 9 * DAY);
    w.newId = () => t.gid("NG");
    w.freshEmail = () => { const e = `sim+m${seed}x${n()}@example.com`; t.allow(e); return e; };
    w.secrets.push(org.email);
    await org.settings(g.id, { guestInvites: { on: true, per: 2, cats: ["family", "friends"] } });
    const A_ = (code, extra = {}) => (w.actors[code] = { code, h: {}, hasTicket: false, devOk: false, ...extra });
    A_("ANON");
    A_("BAD", { h: { "x-organizer": "ctk_" + "ab".repeat(24) } });
    A_("ORG", { h: org.h });
    A_("AI", { h: { "x-organizer": org.aiKey } });
    A_("PLAT", { h: { "x-organizer": PLATFORM_KEY } });
    // the other account
    if (want("ORGX") || want("ORGXAI")) {
      const x = await t.newOrg("x"); w.other = x; w.secrets.push(x.email);
      A_("ORGX", { h: x.h }); A_("ORGXAI", { h: { "x-organizer": x.aiKey } });
      const gx = await mkGame(t, x, { cap: 20, days: 6, name: "Other account game" }); w.eidX = gx.id;
    }
    // team
    if (want("HOST") || want("HOSTL")) { w.host = await t.host(org, "Hema Iyer"); w.secrets.push(w.host.email); A_("HOST", { h: { "x-organizer": w.host.key } }); A_("HOSTL", { h: { "x-organizer": w.host.key, "x-ct-link": "1" }, link: w.host.key }); }
    if (want("HOSTN")) {
      const email = w.freshEmail(), mob = mobile(R); w.secrets.push(email);
      const inv = await org.inviteHost({ label: "Newcomer Host", email, mobile: mob }); w.hostNId = inv.id; w.hostNKey = inv.hostKey; w.hostNEmail = email; A_("HOSTN", { h: { "x-organizer": inv.hostKey } });
    }
    if (want("COH") || want("COHN") || want("COHY")) {
      if (want("COH")) { const c = await t.cohost(org, g.id, "Dev Kapoor"); w.secrets.push(c.raw.phoneMasked ?? ""); A_("COH", { h: c.h, cohost: c }); }
      if (want("COHN")) { const c = await t.cohost(org, g.id, "Nina NotAccepted", { accept: false }); A_("COHN", { h: c.h, cohost: c }); }
      if (want("COHY")) { const c = await t.cohost(org, g2.id, "Yash OtherGame"); A_("COHY", { h: c.h, cohost: c }); }
    }
    // people (only when the game is open for them)
    const open = !!S.pubd;
    if (open) {
      const pr = await org.publish(g.id, mobile(R)); if (!pr.ok) throw new Error("publish: " + pr.status + JSON.stringify(pr.body).slice(0, 160));
      if (S.pay) { const q = await org.pay(g.id); if (!q.ok) throw new Error("pay: " + q.status + JSON.stringify(q.body).slice(0, 160)); }
    }
    const seatOf = async (gst) => (await gst.me()).body?.seat;
    const mkTicket = (code, gst, name, phone) => A_(code, { h: { "x-ct-pid": gst.pid, "x-ct-dev": gst.device }, hasTicket: true, devOk: true, pid: gst.pid, dev: gst.device, name, phone });
    w.waitingId = null;
    if (open && !S.dns) {
      try {
        if (want("PART") || want("PARTX") || need === null) {
          const name = "Parth Participantsingh", phone = mobile(R); w.secrets.push(phone, name);
          const added = await org.addPeople(g.id, [{ name, phone }]); const tok = A.tokenOfLink(added.people?.[0]?.link ?? "");
          const gst = new A.Guest("", g.id, phone, name);
          const jr = await A.joinByToken(g.id, tok, phone, name, gst.ip); if (!jr.ok) throw new Error("personal-link join: " + jr.status + JSON.stringify(jr.body).slice(0, 160));
          gst.pid = jr.body.pid; mkTicket("PART", gst, name, phone); w.partPid = gst.pid; w.seatOfPart = await seatOf(gst);
          A_("PARTX", { h: { "x-ct-pid": gst.pid, "x-ct-dev": badDevice() }, hasTicket: true, devOk: false, pid: gst.pid, dev: badDevice() });
          w.pidsParam = gst.pid;
        }
        if ((want("G1") || want("G2") || need === null)) {
          const name = "Gita Guestwala", phone = mobile(R); w.secrets.push(phone, name);
          if (S.list) { await org.addPeople(g.id, [{ name, phone }]); }
          const g1 = new A.Guest("", g.id, phone, name); const r1 = await g1.join();
          if (r1.ok) {
            mkTicket("G1", g1, name, phone); const seat1 = await seatOf(g1);
            if (!S.list) { const name2 = "Gopal Guestwala", phone2 = mobile(R); w.secrets.push(phone2, name2); const g2 = new A.Guest("", g.id, phone2, name2); const r2 = await g2.join({ from: seat1, cat: "family" }); if (r2.ok) mkTicket("G2", g2, name2, phone2); else w.notes.push("level-2 join failed " + r2.status + JSON.stringify(r2.body).slice(0, 120)); } else w.notes.push("no level-2 guest in a list-only game (an unlisted person waits)");
          } else w.notes.push("level-1 join failed " + r1.status + JSON.stringify(r1.body).slice(0, 120));
        }
        if (S.list) { // an unlisted person asks to come in: the waiting room is not empty
          const wp = mobile(R), wn = "Wanda Waitingroom"; w.secrets.push(wp, wn);
          const jw = await new A.Guest("", g.id, wp, wn).join(); w.notes.push("waiting-room join: " + jw.status);
          const wl = await org.waiting(g.id); w.waitingId = (wl.body?.waiting ?? [])[0]?.id ?? null; if (!w.waitingId) w.notes.push("no waiting id: " + JSON.stringify(wl.body).slice(0, 120));
        }
        if (st === "overcap") { const jx = await new A.Guest("", g.id, mobile(R), "Overflow Person").join(); w.notes.push("overflow join: " + jx.status); }
      } catch (e) { w.notes.push("people setup: " + (e?.message ?? e)); }
    }
    // the state itself
    if (S.cancelled) { const c = await org.cancel(g.id); if (!c.ok) throw new Error("cancel: " + c.status + JSON.stringify(c.body).slice(0, 160)); }
    if (S.reopen) { const r = await org.api("POST", `/api/z/${g.id}/reopen`, { startRound: w.futureRound }); if (!r.ok) throw new Error("reopen: " + r.status + JSON.stringify(r.body).slice(0, 160)); }
    if (S.erased) { const r = await org.erase(g.id); if (!r.ok) throw new Error("erase: " + r.status); }
    // the signing key (for control cells) and its public half
    const ctl = await import("../../../../packages/beacon/src/control.ts");
    w.ctl = ctl; w.secret = "42".repeat(32); w.pubKey = ctl.publicKeyFromSecret(w.secret);
    if (S.time) {
      const tgt = { hold: w.startMs - 20_000, run: w.startMs + 5 * MIN, end: w.startMs + 10 * HOUR, dns: w.startMs + 21 * HOUR }[S.time];
      if (S.pause) { // register the key and publish a pause BEFORE the clock reaches the start (a pause needs lead time)
        const kr = await org.api("PUT", `/api/z/${g.id}/control/key`, { publicKey: w.pubKey }); if (!kr.ok) w.notes.push("control key: " + kr.status + JSON.stringify(kr.body).slice(0, 120));
      }
      await clock.set(tgt); await clock.tick(); await clock.advance(MIN); await clock.tick();
      if (S.pause) {
        try {
          const f = (await A.call("GET", `/api/z/${g.id}/control`)).body; const nowRound = L.roundAt(await clock.now());
          const m = ctl.signControlWithSecret(w.secret, ctl.nextMessage(f, nowRound, { action: "pause", pauseForRounds: 4000 }));
          const pr = await A.call("POST", `/api/z/${g.id}/control`, { message: m }); w.notes.push("pause: " + pr.status + " " + JSON.stringify(pr.body).slice(0, 100)); w.paused = pr.ok;
        } catch (e) { w.notes.push("pause failed: " + (e?.message ?? e)); }
      }
    }
    w.sum = (await org.summary(g.id)).body;
    try {
      const inf = (await A.call("GET", `/api/z/${g.id}/info`, undefined, org.h)).body, lf = (await org.api("GET", `/api/z/${g.id}/life`)).body, cf = (await A.call("GET", `/api/z/${g.id}/control`)).body;
      w.notes.unshift(`state=${st} status="${w.sum.status}" payment=${w.sum.payment?.status ?? "-"} locked=${inf.locked ?? false} cancelled=${inf.cancelled ?? false} didNotStart=${inf.didNotStart ?? false} started=${lf.started ?? "?"} endMsFromNow=${lf.endMs != null ? Math.round((lf.endMs - (await clock.now())) / 60000) + "min" : "?"} reportSent=${lf.reportSent} purged=${lf.purged} participants=${w.sum.participants ?? "?"} controlMessages=${(cf.messages ?? []).length}`);
    } catch (e) { w.notes.unshift("state probe failed " + (e?.message ?? e)); }
    w.snap0 = await snapshot(w);
    return w;
  }

  // ---------------------------------------------------------------- one cell
  function pathFor(r, w, a) {
    let p = r.p(w, a);
    if (a.code === "HOSTL" && a.link) p = "/ai/" + a.link + "/" + p.replace(/^\/api\//, "");
    return p;
  }
  const diffSnap = (a, b) => { try { const x = JSON.parse(a), y = JSON.parse(b); return Object.keys(y).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).map((k) => `${k}: ${JSON.stringify(x[k]).slice(0, 90)} -> ${JSON.stringify(y[k]).slice(0, 90)}`).join(" ; "); } catch { return "?"; } };
  const leaksIn = (w, a, res) => { const mine = new Set([a.phone, a.name].filter(Boolean)); const txt = JSON.stringify(res.body); return w.secrets.filter((x) => x && !mine.has(x) && txt.includes(x)); };
  async function runCell(t, w, r, a, st, method) {
    const m = method ?? r.m;
    const body = m === "GET" || m === "HEAD" ? undefined : r.b ? r.b(w, a) : undefined;
    const path = pathFor(r, w, a);
    const exp = method ? "refuse" : expectOf(r, a, st);
    const watch = exp === "deny" || exp === "refuse" || exp === "biz" || (!!r.watch && !callerInA(r, a.code));
    const before = watch ? await snapshot(w) : "";
    const res = await A.call(m, path, body, a.h, { ip: t.ip() });
    const label = `${ACTOR_NAME[a.code] ?? a.code} ${m} ${r.id}`;
    const s = res.status, msg = String(res.body?.error ?? res.body?.text ?? "");
    const okc = s >= 200 && s < 300;
    let pass, why = "";
    switch (exp) {
      case "ok": pass = okc; break;
      case "pass": pass = s < 500 && (!isDenied(res) || res.body?.code === "consent-required"); if (!pass && s < 500) why = " (a permission denial where the caller is allowed)"; break;
      case "biz": pass = s >= 400 && s < 500; if (pass && isDenied(res)) why = " (denied instead of a business refusal)"; break;
      case "deny": pass = isDenied(res); if (!pass) why = okc ? " PRIVILEGE: the call was accepted" : " (refused, but not by the permission gate: the request was read before the caller was checked)"; break;
      case "refuse": pass = s >= 400 && s < 500; if (!pass) why = okc ? " PRIVILEGE: the call was accepted" : ""; break;
      default: pass = s < 500;
    }
    t.check(`status ${label} [${st}] wants ${exp}`, pass, `HTTP ${s} ${JSON.stringify(res.body).slice(0, 170)}${why}`);
    if (s >= 400) {
      if (r.noPlain && typeof res.body?.error !== "string") { /* a data answer, not a refusal (the pause file of a game that has none yet, the visit beacon) */ }
      else if (res.body && typeof res.body.error !== "string" && res.body.text !== undefined) { const tx = String(res.body.text); t.check(`plain words ${label} [${st}]`, tx.length > 0 && tx.length < 400 && !/undefined|\[object|SQLITE|TypeError|stack|\.ts:\d/.test(tx), tx.slice(0, 120)); }
      else { const why2 = friendly(res.body); t.check(`plain words ${label} [${st}]`, !why2 && /\s/.test(msg.trim()), why2 || (/\s/.test(msg.trim()) ? "" : msg ? `one-word message "${msg}"` : "no message")); }
      const leak = leaksIn(w, a, res); t.check(`no data leak ${label} [${st}]`, leak.length === 0, leak.join(" | "));
    } else if (r.pub && !r.tk) { const leak = leaksIn(w, a, res); t.check(`public answer holds no personal data ${label} [${st}]`, leak.length === 0, leak.join(" | ")); }
    if (watch) { const after = await snapshot(w); t.check(`refused call changed nothing ${label} [${st}]`, before === after, before === after ? "" : "state differs after the call: " + diffSnap(before, after)); }
    return res;
  }

  // ---------------------------------------------------------------- scenario list
  const nameOf = (st, a, r, m) => `perm|${st}|${ACTOR_NAME[a] ?? a} x ${m ?? r.m} ${r.id}`;
  const groups = [];
  const mkGroup = (key, st, buildFn) => {
    const grp = { key, st, world: null, async enter(setupT) { grp.world = await buildFn(setupT); return grp.world; }, async leave() { grp.world = null; try { await clock.reset(); } catch { /* ignore */ } } };
    groups.push(grp); return grp;
  };
  const push = (grp, name, fn, extra = {}) => out.push({ name, group: grp, noMailCheck: true, allowUnfriendly: true, timeoutMs: 120_000, ...extra, run: async (t) => { const w = grp.world; if (!w) throw new Error("harness: the world of group " + grp.key + " did not build: " + (grp.error ?? "unknown")); await fn(t, w); } });
  const fallbackActor = (w, code) => w.actors[code] ?? { code, h: {}, hasTicket: false, devOk: false };
  const callerInA = (r, code) => { if (r.tk && r.destr && ["PART", "G1", "G2"].includes(code)) return true;  const A = new Set((r.A ?? "").split(/\s+/).filter(Boolean)); const L_ = { ORG: "M", HOST: "H", HOSTL: "HL", COH: "C", AI: "AI", PLAT: "P", ORGX: "M", ORGXAI: "AI" }[code]; return !!L_ && A.has(L_) && (code !== "ORGX" && code !== "ORGXAI" || r.kind !== "z"); };
  const probe = (code) => ({ code, hasTicket: ["PART", "G1", "G2", "PARTX"].includes(code), devOk: ["PART", "G1", "G2"].includes(code) });

  for (const st of STATE_ORDER) {
    const full = st === "draft" || st === "pub" || st === "paid";
    const actors = full ? ALL_ACTORS : MID_ACTORS;
    const grp = mkGroup("state-" + st, st, (t) => build(t, st));
    for (const r of ROUTES) {
      if (r.kind !== "z" && st !== "paid") continue;                // account-level and owner routes run once, in the "paid" world
      if (!full && !r.core && r.kind === "z") continue;             // the other states run the core routes
      for (const code of actors) {
        if (r.platSkip && code === "PLAT") continue;
        const dAllowed = !!r.destr && callerInA(r, code); // a caller who is in the route's allowed list may really do it: that cell runs last, on a world of its own where the state would break the others
        const nm = nameOf(st, code, r);
        if (r.isolate) { // a call that may act on the game whoever makes it: every caller gets a world of its own (the open states), or runs last (the time states)
          if (full) out.push({ name: nm + " (private world)", group: null, noMailCheck: true, allowUnfriendly: true, timeoutMs: 150_000, run: async (t) => { const w = await build(t, st, [...new Set([code, "ORG", "HOST"])]); await runCell(t, w, r, fallbackActor(w, code), st); } });
          else if (!callerInA(r, code)) push(grp, nm, async (t, w) => { await runCell(t, w, r, fallbackActor(w, code), st); }, { order: 1 });
          else if (code === "ORG") push(grp, nm + " (shared world, last)", async (t, w) => { await runCell(t, w, r, fallbackActor(w, code), st); }, { order: 3 });
          continue;
        }
        if (!dAllowed) { push(grp, nm, async (t, w) => { await runCell(t, w, r, fallbackActor(w, code), st); }, { order: 0 }); continue; }
        // a destructive call by an allowed caller: a private world in the open states, the shared world (last, one caller) in the time states
        if (full) out.push({ name: nm + " (private world)", group: null, noMailCheck: true, allowUnfriendly: true, timeoutMs: 150_000, run: async (t) => { const w = await build(t, st, [...new Set([code, "ORG", "HOST", "PLAT", "AI", "COH", "PART", "G1"])]); await runCell(t, w, r, fallbackActor(w, code), st); } });
        else if (code === "ORG" || code === "PART" || (r.kind !== "z" && code === "ORGX")) push(grp, nm + " (shared world, last)", async (t, w) => { await runCell(t, w, r, fallbackActor(w, code), st); }, { order: r.lastOfAll ? 3 : 2 });
      }
    }
  }
  // wrong methods on every route (the state does not matter): in the "paid" world
  const paidGrp = groups.find((g) => g.key === "state-paid");
  const WRONG = { GET: ["DELETE", "PUT"], POST: ["DELETE", "GET"], PATCH: ["DELETE", "GET"], PUT: ["DELETE", "GET"] };
  const realPairs = new Set(ROUTES.map((q) => q.m + " " + (q.path0 ?? "").split("?")[0]));
  const alsoReal = (r, mm) => realPairs.has(mm + " " + (r.path0 ?? "").split("?")[0]) || (r.kind === "owner" && /audit\/access|\/audit\//.test(r.path0 ?? "") && mm !== "GET") || (r.id.startsWith("settings") && (mm === "POST" || mm === "PATCH")) || (r.id.startsWith("checkin") && (mm === "GET" || mm === "POST")) || r.path0 === "/api/z/X/people";
  for (const r of ROUTES) {
    if (r.platSkip) continue;
    for (const mm of WRONG[r.m] ?? ["DELETE"]) {
      if (alsoReal(r, mm)) continue;
      if (r.id.startsWith("settings") && mm === "POST") continue;
      for (const code of ["ANON", "ORG", "PLAT"]) {
        if (r.kind === "owner" && code === "ORG") continue;
        push(paidGrp, `method|${ACTOR_NAME[code]} x ${mm} ${r.id} (the route is ${r.m})`, async (t, w) => { await runCell(t, w, r, fallbackActor(w, code), "paid", mm); }, { order: 0 });
      }
    }
  }
  // ======================================================================== more families
  const SIM = L.SIM;
  const raw = async (method, path, body, headers = {}, ip) => {
    const r = await fetch(SIM + path, { method, headers: { "content-type": "application/json", ...(ip ? { "x-sim-ip": ip } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { text }; }
    return { status: r.status, body: j, ok: r.ok, headers: r.headers, text };
  };
  const plain = (res) => { const tx = String(res.body?.error ?? res.body?.text ?? ""); return tx.length > 0 && tx.length < 400 && !/undefined|\[object|SQLITE|TypeError|ReferenceError|stack trace|\.ts:\d|\.js:\d/.test(tx) ? "" : `unfriendly or empty message: ${tx.slice(0, 100)}`; };
  const enc = (o) => encodeURIComponent(typeof o === "string" ? o : JSON.stringify(o));

  // ---- (1) the /ai/ links: which key opens what ------------------------------------------------
  const AIK = [["AIK", "AI key (cta_)"], ["HK", "Host key (cth_)"], ["MK", "Organizer key (ctk_)"], ["CK", "Co-host key (ctc_)"], ["PK", "platform key"], ["BK", "made-up key"], ["XK", "AI key of another account"], ["HNK", "first-open key of an unfinished Host"]];
  // expected per key: S = 2xx, D = refused (401/403/404), 405 = text "read with GET", 400, N4 = 404 or 403, C = any 4xx, A = anything but a crash
  const AIC = [
    ["manual", () => "", "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["manual-post", () => "", "POST", { AIK: "405", HK: "405", HNK: "A" }],
    ["manual-delete", () => "", "DELETE", { AIK: "405", HK: "405", HNK: "A" }],
    ["start", () => "/start", "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["map", () => "/map", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["facts", () => "/facts", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["go", () => "/go", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["summary", (w) => `/z/${w.eid}/summary`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["participants", (w) => `/z/${w.eid}/participants`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["info", (w) => `/z/${w.eid}/info`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["prizes", (w) => `/z/${w.eid}/prizes`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["reportlink", (w) => `/z/${w.eid}/reportlink`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["life", (w) => `/z/${w.eid}/life`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["settings", (w) => `/z/${w.eid}/settings?_method=PATCH&_body=${enc({ name: "Set by an AI" })}`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["publish", (w) => `/z/${w.eid}/publish?_method=POST&_body=${enc({})}`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["announce", (w) => `/z/${w.eid}/announce?_method=POST&_body=${enc({ text: "Hello from the link" })}`, "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["roster", (w) => `/z/${w.eid}/roster?_method=POST&_body=${enc({ people: [{ name: "Asha Rao", phone: "9876543210" }] })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["cancel", (w) => `/z/${w.eid}/cancel?_method=POST&_body=${enc({ confirmations: 3 })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["erase", (w) => `/z/${w.eid}/erase?_method=POST&_body=${enc({})}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["clone", (w) => `/z/${w.eid}/clone?_method=POST&_body=${enc({})}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["people", (w) => `/z/${w.eid}/people`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["names", (w) => `/z/${w.eid}/names?pids=${w.pidsParam}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["claims-read", (w) => `/z/${w.eid}/claims`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["presence", (w) => `/z/${w.eid}/presence`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["control-request", (w) => `/z/${w.eid}/control/request?_method=POST&_body=${enc({ action: "pause" })}`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["control-request-read", (w) => `/z/${w.eid}/control/request`, "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["control-key", (w) => `/z/${w.eid}/control/key?_method=POST&_body=${enc({})}`, "GET", { AIK: "C", HK: "C", HNK: "A" }],
    ["paylink", (w) => `/z/${w.eid}/paylink?_method=POST&_body=${enc({})}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["pay-with-credit", (w) => `/z/${w.eid}/pay-with-credit?_method=POST&_body=${enc({})}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["pay-test", (w) => `/payments/test?_method=POST&_body=${enc({ eid: w.eid2, email: "a@example.com", org: "X", country: "IN" })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["checkout", (w) => `/checkout?_method=POST&_body=${enc({ eid: w.eid2, email: "a@example.com", org: "X", country: "IN", pack: 100 })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["team", () => "/org/team", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["cohost-add", (w) => `/org/cohost?_method=POST&_body=${enc({ label: "Dev Kapoor", phone: "9822200011", e: w.eid })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["host-add", () => `/org/host?_method=POST&_body=${enc({ label: "Sunita", email: "s@example.com" })}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["keys", () => "/org/keys", "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["ai-link", () => "/org/ai/link", "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["close", () => `/org/close?_method=POST&_body=${enc({})}`, "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["history", () => "/history", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["suggestions", () => "/z/suggestions", "GET", { AIK: "S", HK: "D", HNK: "A" }],
    ["credit", () => "/org/credit", "GET", { AIK: "D", HK: "D", HNK: "A" }],
    ["whoami", () => "/whoami", "GET", { AIK: "S", HK: "S", HNK: "A" }],
    ["method-delete", (w) => `/z/${w.eid}/summary?_method=DELETE`, "GET", { AIK: "400", HK: "400", HNK: "A" }],
    ["unknown-path", () => "/nothing/here", "GET", { AIK: "N4", HK: "N4", HNK: "A" }],
  ];
  const paidGrp2 = groups.find((g) => g.key === "state-paid");
  for (const [kc, kname] of AIK) for (const [cid, restFn, method, expMap] of AIC) {
    push(paidGrp2, `ailink|${kname} x ${method} /ai/<key>${cid === "manual" ? "" : "/" + cid}${method !== "GET" ? " " + method : ""}`, async (t, w) => {
      const key = { AIK: w.actors.AI.h["x-organizer"], HK: w.host?.key, MK: w.org.token, CK: w.actors.COH?.cohost?.key, PK: PLATFORM_KEY, BK: "cta_" + "cd".repeat(24), XK: w.other?.aiKey, HNK: w.hostNKey }[kc];
      const before = await snapshot(w);
      const res = await raw(method, "/ai/" + key + restFn(w), method === "GET" ? undefined : "{}", {}, t.ip());
      const gameBound = restFn(w).includes(w.eid) && !["info", "method-delete"].includes(cid); const exp = kc === "XK" ? (gameBound ? "X" : expMap.AIK) : (expMap[kc] ?? "N");
      const s = res.status, tx = String(res.body?.text ?? res.body?.error ?? "");
      let pass, why = "";
      if (exp === "S") pass = (s >= 200 && s < 300) || (cid === "announce" && s === 429);
      else if (exp === "D") pass = s === 403 || s === 404 || s === 401;
      else if (exp === "405") pass = s === 405;
      else if (exp === "400") pass = s === 400;
      else if (exp === "N4") pass = s === 404 || s === 403;
      else if (exp === "C") pass = s >= 400 && s < 500;
      else if (exp === "A") pass = s < 500;
      else if (exp === "X") pass = s === 404 || s === 403;
      else { pass = s === 404 && /Not found/i.test(tx); if (!pass) why = " (a key that is not an AI or Host work link must get the plain 'Not found.' 404)"; if (s >= 200 && s < 300) why = " PRIVILEGE: a non-work-link key was accepted at /ai/"; }
      t.check(`status ai-link ${kname} ${method} ${cid} wants ${exp}`, pass, `HTTP ${s} ${tx.slice(0, 120)}${why}`);
      if (s >= 400) { const bad = plain(res); t.check(`plain words ai-link ${kname} ${cid}`, !bad, bad); const lk = w.secrets.filter((x) => x && tx.includes(x)); t.check(`no data leak ai-link ${kname} ${cid}`, lk.length === 0, lk.join(" | ")); const after = await snapshot(w); t.check(`refused call changed nothing ai-link ${kname} ${cid}`, before === after, "state differs after the call"); }
    }, { order: 0 });
  }
  // OPTIONS (pre-flight) on every kind of address
  const OPT_PATHS = ["/api/whoami", "/api/z", "/api/z/EID/settings", "/api/z/EID/summary", "/api/z/EID/join", "/api/z/EID/control", "/api/z/EID/people", "/api/org/team", "/api/org/close", "/api/start", "/api/auth/verify", "/api/owner/ledger", "/api/payments/test", "/api/checkout", "/api/notices", "/api/mode", "/ai/cta_xx", "/ai/cta_xx/z/EID/summary", "/j/abcdefghij", "/api/nothing"];
  for (const p of OPT_PATHS) for (const code of ["ANON", "ORG", "BAD"]) push(paidGrp2, `options|${ACTOR_NAME[code]} x OPTIONS ${p}`, async (t, w) => {
    const path = p.replace("EID", w.eid); const res = await raw("OPTIONS", path, undefined, w.actors[code].h, t.ip());
    t.check(`pre-flight ${path} answers 204`, res.status === 204 || (path.startsWith("/j/") && res.status < 500), `HTTP ${res.status}`);
    if (!path.startsWith("/j/")) t.check(`pre-flight ${path} allows other origins to call it with the key header`, (res.headers.get("access-control-allow-origin") ?? "") === "*" && /x-organizer/i.test(res.headers.get("access-control-allow-headers") ?? ""), `${res.headers.get("access-control-allow-origin")} / ${res.headers.get("access-control-allow-headers")}`);
    t.check(`pre-flight ${path} carries no body and no data`, (res.text ?? "").length === 0, (res.text ?? "").slice(0, 80));
  }, { order: 0 });

  // ---- (2) /j/ personal links -------------------------------------------------------------------
  const JC = [["a token that never existed", () => "abcdefghjk", [404]], ["too short", () => "abc", [404]], ["200 characters", () => "a".repeat(200), [404]], ["upper case of a real-looking token", () => "ABCDEFGHJK", [404]], ["with a slash inside", () => "abc/def", [404]], 
    ["a script tag", () => encodeURIComponent("<script>alert(1)</script>"), [404]], ["quote and semicolon", () => encodeURIComponent("a';--"), [404]], ["a null byte", () => "ab%00cd", [404]], ["unicode", () => encodeURIComponent("日本語トークン"), [404]], ["empty", () => "", [404, 200, 301, 302]]];
  for (const [label, tokFn, want] of JC) for (const code of ["ANON", "BAD", "ORG"]) push(paidGrp2, `jlink|${ACTOR_NAME[code]} opens /j/ ${label}`, async (t, w) => {
    const res = await raw("GET", "/j/" + tokFn(), undefined, w.actors[code].h, t.ip());
    t.check(`/j/ ${label} answers ${JSON.stringify(want)}`, want.includes(res.status), `HTTP ${res.status} ${String(res.text).slice(0, 120)}`);
    t.check(`/j/ ${label}: no script reflected, no server detail`, !/<script>alert|SQLITE|TypeError|\.ts:\d/.test(res.text), String(res.text).slice(0, 120));
  }, { order: 0 });
  push(paidGrp2, "jlink|a real unused token, a removed person's token, and a wrong method", async (t, w) => {
    const phone = freshPhone(), name = "Jaya Linkperson"; w.secrets.push(phone, name);
    const add = await w.org.addPeople(w.eid, [{ name, phone }]); const link = add.people?.[0]?.link ?? ""; const tok = A.tokenOfLink(link);
    const open = await raw("GET", "/j/" + tok, undefined, {}, t.ip()); t.check("a fresh token opens the join page (200 or a redirect)", open.status === 200 || open.status === 302 || open.status === 301, `HTTP ${open.status} ${String(open.text).slice(0, 80)}`);
    t.check("the join page never shows the person's number", !String(open.text).includes(phone), "");
    const post = await raw("POST", "/j/" + tok, "{}", {}, t.ip()); t.check("POST to a personal link is refused with a plain 4xx", post.status >= 400 && post.status < 500, `HTTP ${post.status} ${String(post.text).slice(0, 100)}`);
    const id = add.people?.[0]?.id; const rm = await w.org.api("POST", `/api/z/${w.eid}/people/${id}/remove`, {}); t.check("the Organizer removes the person", rm.ok, `HTTP ${rm.status} ${JSON.stringify(rm.body).slice(0, 100)}`);
    const gone = await raw("GET", "/j/" + tok, undefined, {}, t.ip()); t.check("a removed person's link is a plain 404", gone.status === 404, `HTTP ${gone.status}`);
  }, { order: 0 });

  // ---- (3) odd game ids on the main routes ------------------------------------------------------
  const WEIRD = [["too short", "abc"], ["41 characters", "A".repeat(41)], ["with a space", "AB%20CD"], ["with a quote", "AB'CD"], ["dot dot", ".."], ["an encoded slash", "AB%2FCD"], ["a null byte", "AB%00CD"], ["unicode", encodeURIComponent("खेल१२३४")], ["a semicolon", "AB;CD"], ["only dashes", "----"], ["the lower-case form of a real id", "__LOWER__"]];
  const WROUTES = [["summary", "GET", "/summary"], ["info", "GET", "/info"], ["settings", "PATCH", "/settings"], ["publish", "POST", "/publish"], ["join", "POST", "/join"], ["cancel", "POST", "/cancel"], ["people", "GET", "/people"], ["claims", "POST", "/claims"], ["control", "GET", "/control"], ["erase", "POST", "/erase"]];
  for (const [wl, wid] of WEIRD) for (const [rid, m, suffix] of WROUTES) for (const code of ["ANON", "ORG"]) push(paidGrp2, `weird-id|${ACTOR_NAME[code]} x ${m} ${rid} with an id that is ${wl}`, async (t, w) => {
    const lowerReal = wid === "__LOWER__"; const id = lowerReal ? w.eid.toLowerCase() : wid;
    const res = await raw(m, `/api/z/${id}${suffix}`, m === "GET" ? undefined : JSON.stringify({ x: 1 }), w.actors[code].h, t.ip());
    t.check(`odd id (${wl}) on ${rid} is a plain 4xx, never a crash`, (res.status >= 400 && res.status < 500) || (rid === "control" && res.status < 500), `HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 140)}`);
    if (res.status >= 400 && !(rid === "control" && res.body?.registered === false)) { const bad = plain(res); t.check(`odd id (${wl}) on ${rid}: plain words`, !bad, bad); }
    if (lowerReal) t.check("an id in the wrong letter case never opens the real game", !(res.status >= 200 && res.status < 300 && JSON.stringify(res.body).includes(w.eid)), `HTTP ${res.status}`);
  }, { order: 0 });

  // ---- (4) existence / IDOR: the same refusal for a game that is not yours and a game that does not exist ----------------
  const idorGrp = groups.find((g) => g.key === "state-paid");
  const IDOR_ROUTES = ROUTES.filter((r) => r.kind === "z" && !r.pub && !r.id.startsWith("people") && !r.id.startsWith("waiting") && !["pay-test", "checkout", "control-key", "control-request", "control-request-read", "control-request-clear", "cohost-header", "paylink", "pay-with-credit"].includes(r.id));
  const sig = (res) => `${res.status}|${String(res.body?.error ?? res.body?.text ?? "").slice(0, 80)}|${res.body?.code ?? ""}`;
  for (const r of IDOR_ROUTES) for (const code of ["ORGX", "ORGXAI"]) push(idorGrp, `idor|${ACTOR_NAME[code]} x ${r.m} ${r.id}: a game of another account answers like a game that does not exist`, async (t, w) => {
    const a = fallbackActor(w, code); const real = pathFor(r, w, a); const ghost = real.replace(w.eid, "ZZ-NO-SUCH-GAME");
    const body = r.b ? r.b(w, a) : undefined; const before = await snapshot(w);
    const x = await A.call(r.m, real, body, a.h, { ip: t.ip() }); const g = await A.call(r.m, ghost, r.b ? JSON.parse(JSON.stringify(r.b(w, a)).replaceAll(w.eid, "ZZ-NO-SUCH-GAME")) : undefined, a.h, { ip: t.ip() });
    t.check(`other account refused on ${r.id}`, isDenied(x) || (x.status >= 400 && x.status < 500), `HTTP ${x.status} ${JSON.stringify(x.body).slice(0, 150)}`);
    t.check(`other account cannot tell a real game from a missing one on ${r.id}`, sig(x) === sig(g) || (x.status === g.status && x.status !== 200), `real: ${sig(x)}   missing: ${sig(g)}`);
    const lk = w.secrets.filter((s) => s && JSON.stringify(x.body).includes(s)); t.check(`no data leak on ${r.id}`, lk.length === 0, lk.join(" | "));
    t.check(`refused call changed nothing on ${r.id}`, before === (await snapshot(w)), "state differs after the call");
  }, { order: 0 });
  for (const r of IDOR_ROUTES.filter((x) => ["summary", "info", "participants", "settings", "cancel-preview"].includes(x.id))) push(idorGrp, `idor|anonymous x ${r.m} ${r.id}: a game answers like a game that does not exist`, async (t, w) => {
    const a = fallbackActor(w, "ANON"); const real = pathFor(r, w, a); const ghost = real.replace(w.eid, "ZZ-NO-SUCH-GAME");
    const x = await A.call(r.m, real, r.b ? r.b(w, a) : undefined, {}, { ip: t.ip() }); const g = await A.call(r.m, ghost, r.b ? r.b(w, a) : undefined, {}, { ip: t.ip() });
    t.check(`anonymous cannot tell a real game from a missing one on ${r.id}`, sig(x) === sig(g) || r.id === "info", `real: ${sig(x)}   missing: ${sig(g)}`);
  }, { order: 0 });
  // account-level reads and writes that name another account's things
  const IDOR_ACCT = [
    ["history lists only my games", async (t, w) => { const r = await A.call("GET", "/api/history", undefined, w.actors.ORGX.h); t.check("history answers", r.ok, `HTTP ${r.status}`); t.check("history of another account never names this account's games", !JSON.stringify(r.body).includes(w.eid) && !JSON.stringify(r.body).includes(w.eid2), "it lists a game of another account"); }],
    ["team list with ?e= of another account's game", async (t, w) => { const r = await A.call("GET", `/api/org/team?e=${w.eid}`, undefined, w.actors.ORGX.h); t.check("team answers", r.ok, `HTTP ${r.status}`); t.check("no Co-host of another account is shown", (r.body.cohosts ?? []).length === 0 && !JSON.stringify(r.body).includes("Dev Kapoor") && !JSON.stringify(r.body).includes("Hema"), JSON.stringify(r.body).slice(0, 200)); }],
    ["add a Co-host to another account's game", async (t, w) => { const before = await snapshot(w); const r = await A.call("POST", "/api/org/cohost", { label: "Intruder Person", phone: freshPhone(), e: w.eid }, w.actors.ORGX.h); t.check("refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); t.check("nothing was added to the game's account", before === (await snapshot(w)), "state differs"); }],
    ["reuse the roster of another account's game", async (t, w) => { const other = w.eidX; const r = await A.call("POST", `/api/z/${other}/reuse`, { from: w.eid }, w.actors.ORGX.h); t.check("refused with a plain 4xx", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); }],
    ["create a game with the id of another account's game", async (t, w) => { const before = await snapshot(w); const r = await A.call("POST", "/api/z", { id: w.eid, startRound: w.futureRound, callSeconds: 9, cap: 10 }, w.actors.ORGX.h); t.check("no 5xx and no data of the real game", r.status < 500 && !JSON.stringify(r.body).includes(w.org.email), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`); t.check("the real game is unchanged", before === (await snapshot(w)), "state differs"); }],
    ["revoke a key of another account by id", async (t, w) => { const id = (await sha256("key|" + w.org.token)).slice(0, 10); const before = await snapshot(w); const r = await A.call("POST", "/api/org/keys/revoke", { id }, w.actors.ORGX.h); t.check("answers without error", r.status < 500, `HTTP ${r.status}`); t.check("the key of the other account still works", (await A.call("GET", "/api/whoami", undefined, w.org.h)).ok, "the key was revoked"); t.check("nothing changed", before === (await snapshot(w)), "state differs"); }],
    ["retire a Host of another account by id", async (t, w) => { const id = w.host.id; const before = await snapshot(w); const r = await A.call("POST", "/api/org/team/retire", { id }, w.actors.ORGX.h); t.check("refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); t.check("the Host still works", (await A.call("GET", "/api/whoami", undefined, w.actors.HOST.h)).ok, "the Host was retired"); t.check("nothing changed", before === (await snapshot(w)), "state differs"); }],
    ["new first-open link for a Host of another account", async (t, w) => { const before = await snapshot(w); const r = await A.call("POST", "/api/org/host/link", { id: w.hostNId }, w.actors.ORGX.h); t.check("refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); t.check("the Host's old link still works", (await A.call("GET", "/api/whoami", undefined, w.actors.HOSTN.h)).ok, "the old link was cancelled"); t.check("nothing changed", before === (await snapshot(w)), "state differs"); }],
    ["suggestions never show who wrote them to another account", async (t, w) => { await A.call("POST", "/api/z/suggestions", { kind: "improvement", title: "Louder numbers please " + w.n(), body: "The caller voice could be a little louder for a big hall." }, w.org.h); const r = await A.call("GET", "/api/z/suggestions", undefined, w.actors.ORGX.h); t.check("reads", r.ok, `HTTP ${r.status}`); t.check("no account id in the list", !/"org"/.test(JSON.stringify(r.body)) && !JSON.stringify(r.body).includes(w.orgId ?? "~~"), JSON.stringify(r.body).slice(0, 200)); }],
    ["AI audit trail shows only my own calls", async (t, w) => { const mk = "mk" + w.n() + "zq"; await A.call("GET", `/api/z/${w.eid}/summary?marker=${mk}`, undefined, w.actors.AI.h); await A.call("POST", `/api/z/${w.eid}/announce`, { text: "audit marker " + mk }, w.actors.AI.h); const r = await A.call("GET", "/api/org/ai/audit", undefined, w.actors.ORGX.h); t.check("reads", r.status < 500, `HTTP ${r.status}`); t.check("none of the other account's AI calls appear in this account's trail", !JSON.stringify(r.body).includes(mk), "the audit trail shows a call of another account's AI key"); const own = await A.call("GET", "/api/org/ai/audit", undefined, w.actors.ORG.h); t.check("the owner of the AI key does see its calls (control)", JSON.stringify(own.body).includes(mk) || JSON.stringify(own.body).includes(w.eid), JSON.stringify(own.body).slice(0, 120)); }],
    ["schedule helper with ?e= of another account's paid game", async (t, w) => { const r = await A.call("GET", `/api/z/schedule?at=2027-01-01T10:00:00%2B05:30&e=${w.eid}`, undefined, w.actors.ORGX.h); const nowMs = await clock.now(); t.check("answers like for a missing game (the 30-day cap, not the paid game's 365-day window)", r.status < 500 && !(r.body.maxStartMs > nowMs + 31 * DAY), `HTTP ${r.status} maxStartMs ${r.body.maxStartMs} now ${nowMs}`); }],
    ["pay the game of another account", async (t, w) => { const r = await A.call("POST", "/api/payments/test", { eid: w.eid2, email: "a@example.com", org: "X", country: "IN" }, w.actors.ORGX.h); t.check("refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); const s = (await w.org.summary(w.eid2)).body; t.check("the game stayed a draft", s.status === "draft", s.status); }],
    ["credit of another account", async (t, w) => { const r = await A.call("GET", "/api/org/credit", undefined, w.actors.ORGX.h); t.check("reads its own (empty) credit", r.status < 500, `HTTP ${r.status}`); t.check("none of this account's money shows", !JSON.stringify(r.body).includes(w.eid), JSON.stringify(r.body).slice(0, 160)); }],
  ];
  for (const [label, fn] of IDOR_ACCT) push(idorGrp, `idor|account level: ${label}`, async (t, w) => { await fn(t, w); }, { order: 0 });

  // ---- (5) the Terms boxes: every consent point refused without the ticks, nothing stored ----------------------------------
  const { readFileSync } = await import("node:fs");
  const CT = JSON.parse(readFileSync(new URL("../../../../apps/edge/src/consent-text.json", import.meta.url), "utf8")); const CV = CT.version;
  const BOXES = (k) => Object.keys(CT[k]);
  const CASES = (k) => [["no consent field", undefined, "none"], ["consent is the word yes", "yes", "str"], ["consent is true", true, "bool"], ["an old Terms version", { v: "2020-01-01", boxes: BOXES(k) }, "old"], ["no version", { boxes: BOXES(k) }, "nov"], ["no boxes", { v: CV, boxes: [] }, "empty"], ["a box that does not exist", { v: CV, boxes: ["Z"] }, "wrongbox"], ...(BOXES(k).length > 1 ? [["only the first box", { v: CV, boxes: [BOXES(k)[0]] }, "partial"]] : []), ["boxes are not a list", { v: CV, boxes: "A" }, "notlist"]];
  const consentCountSql = "SELECT (SELECT COUNT(*) FROM consent_log) AS c, (SELECT COUNT(*) FROM organizer_email) AS o, (SELECT COUNT(*) FROM payment) AS p, (SELECT COUNT(*) FROM participant) AS q";
  const CONSENT_ROUTES = [
    ["K1", "publish", "state-draft", (w) => ({ m: "POST", p: `/api/z/${w.eid}/publish`, h: w.actors.ORG.h, b: { email: w.org.email, phone: "9811122233" } })],
    ["K1", "publish (Host)", "state-draft", (w) => ({ m: "POST", p: `/api/z/${w.eid}/publish`, h: w.actors.HOST.h, b: { email: w.org.email, phone: "9811122233" } })],
    ["K2", "start (new account)", "state-draft", (w) => ({ m: "POST", p: "/api/start", h: {}, b: { email: `sim+m${seed}k2${w.n()}@example.com` } })],
    ["K3", "test payment", "state-pub", (w) => ({ m: "POST", p: "/api/payments/test", h: w.actors.ORG.h, b: { eid: w.eid, email: w.org.email, org: "Kaveri Foods", country: "IN" } })],
    ["K3", "checkout (Host)", "state-pub", (w) => ({ m: "POST", p: "/api/checkout", h: w.actors.HOST.h, b: { eid: w.eid, email: w.org.email, org: "Kaveri Foods", country: "IN", pack: 100 } })],
    ["K4", "join", "state-paid", (w) => ({ m: "POST", p: `/api/z/${w.eid}/join`, h: {}, b: { phone: freshPhone(), name: "Consent Tester", device: freshDevice() } })],
    ["K5", "role accept (Co-host)", "state-paid", (w) => ({ m: "POST", p: "/api/org/role/accept", h: w.actors.COHN.h, b: {} })],
    ["K5", "role accept (Host)", "state-paid", (w) => ({ m: "POST", p: "/api/org/role/accept", h: w.actors.HOST.h, b: {} })],
    ["K5", "Host setup e-mail", "state-paid", (w) => ({ m: "POST", p: "/api/host/setup/email", h: w.actors.HOSTN.h, b: { email: w.hostNEmail } })],
    ["K6", "roster", "state-paid", (w) => ({ m: "POST", p: `/api/z/${w.eid}/roster`, h: w.actors.ORG.h, b: { people: [{ name: "Asha Rao", phone: freshPhone() }] } })],
    ["K6", "people add", "state-paid", (w) => ({ m: "POST", p: `/api/z/${w.eid}/people`, h: w.actors.ORG.h, b: { people: [{ name: "Ravi Menon", phone: freshPhone() }] } })],
    ["K6", "people add (Co-host)", "state-paid", (w) => ({ m: "POST", p: `/api/z/${w.eid}/people`, h: w.actors.COH.h, b: { people: [{ name: "Ravi Menon", phone: freshPhone() }] } })],
  ];
  for (const [k, label, gk, mk] of CONSENT_ROUTES) {
    const g = groups.find((x) => x.key === gk);
    for (const [cl, val, cid] of CASES(k)) push(g, `consent|${k} ${label}: ${cl}`, async (t, w) => {
      const q = mk(w); const body = { ...q.b, ...(val === undefined ? {} : { consent: val }) };
      const before = await snapshot(w); const c0 = (await A.sql(consentCountSql))[0];
      const res = await raw(q.m, q.p, body, q.h, t.ip()); const c1 = (await A.sql(consentCountSql))[0];
      t.check(`${k} ${label} (${cl}): refused with 400 and the plain request to tick the box`, res.status === 400 && res.body?.code === "consent-required", `HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`);
      t.check(`${k} ${label} (${cl}): the refusal names the point and the Terms version`, res.body?.kind === k && res.body?.version === CV, JSON.stringify(res.body).slice(0, 160));
      const bad = plain(res); t.check(`${k} ${label} (${cl}): plain words`, !bad, bad);
      t.check(`${k} ${label} (${cl}): nothing was stored (no consent row, no account, no payment, no person)`, JSON.stringify(c0) === JSON.stringify(c1) && before === (await snapshot(w)), `${JSON.stringify(c0)} -> ${JSON.stringify(c1)}`);
    }, { order: 0 });
  }

  // ---- (6) expired, revoked and retired keys: a key that is gone is nobody ------------------------------------------------
  async function buildLate(t) {
    const w = await build(t, "paid");
    const org = w.org, mailsFor = async (re) => { const ms = await A.mailbox.list({ to: org.email }); for (const m of ms.reverse()) { const k = re.exec(m.text); if (k) return k[0]; } return null; };
    // expired AI key (24 hours) and expired 24-hour Host key: both are mailed to the Organizer
    await A.mailbox.clear();
    const fr = await org.api("POST", "/api/org/ai/fresh", {}); if (!fr.ok) w.notes.push("ai/fresh " + fr.status); const aiExp = await mailsFor(/cta_[0-9a-f]{48}/);
    const hostAdd = await org.api("POST", "/api/org/host", { label: "Temp Host", email: w.freshEmail(), mobile: freshPhone() }); const hostTemp = await mailsFor(/cth_[0-9a-f]{48}/);
    w.actors.AIEXP = { code: "AIEXP", h: aiExp ? { "x-organizer": aiExp } : {}, hasTicket: false, devOk: false }; if (!aiExp) w.notes.push("no expiring AI key found in the mail");
    w.actors.HOSTEXP = { code: "HOSTEXP", h: hostTemp && hostTemp !== hostAdd.body?.hostKey ? { "x-organizer": hostTemp } : { "x-organizer": "cth_" + "ab".repeat(24) }, hasTicket: false, devOk: false }; if (!hostTemp) w.notes.push("no expiring Host key found in the mail");
    // revoked AI key: replace the AI link (the old key dies), the new one is the AI actor from now on
    const oldAi = w.actors.AI.h["x-organizer"]; const rep = await org.api("POST", "/api/org/ai/replace", {}); if (!rep.ok) w.notes.push("ai/replace " + rep.status);
    w.actors.AIREV = { code: "AIREV", h: { "x-organizer": oldAi }, hasTicket: false, devOk: false }; w.actors.AI = { code: "AI", h: { "x-organizer": rep.body.aiKey }, hasTicket: false, devOk: false };
    // revoked Organizer key: sign in again (a second key), revoke the first with it
    const k1 = org.token; const o2 = await A.Organizer.signIn(org.email, { ip: t.ip() }); const rv = await A.call("POST", "/api/org/keys/revoke", { id: A.sha("key|" + k1).slice(0, 10) }, o2.h);
    if (!rv.ok) w.notes.push("keys/revoke " + rv.status + JSON.stringify(rv.body).slice(0, 100));
    w.actors.MASTREV = { code: "MASTREV", h: { "x-organizer": k1 }, hasTicket: false, devOk: false }; w.actors.ORG = { code: "ORG", h: o2.h, hasTicket: false, devOk: false }; w.org = Object.assign(Object.create(Object.getPrototypeOf(org)), org, { token: o2.token, h: o2.h });
    // retired Co-host and retired Host
    const c = await t.cohost(w.org, w.eid, "Retired Cohost"); const rc = await w.org.retire(c.id); if (!rc.ok) w.notes.push("retire cohost " + rc.status);
    w.actors.COHREV = { code: "COHREV", h: c.h, hasTicket: false, devOk: false };
    const h = await t.host(w.org, "Retired Host"); const rh = await w.org.retire(h.id); if (!rh.ok) w.notes.push("retire host " + rh.status);
    w.actors.HOSTREV = { code: "HOSTREV", h: { "x-organizer": h.key }, hasTicket: false, devOk: false };
    await clock.advance(25 * HOUR); await clock.tick(); w.snap0 = await snapshot(w);
    return w;
  }
  const lateGrp = mkGroup("state-late-keys", "paid", (t) => buildLate(t));
  for (const r of ROUTES) {
    if (!(r.core || r.kind === "acct" || r.kind === "owner") || r.platSkip) continue;
    for (const code of LATE_ACTORS) {
      const e = expectOf(r, { code, hasTicket: false, devOk: false }, "paid");
      if (r.destr && callerInA(r, code)) { if (code === "ORG") push(lateGrp, nameOf("late-keys", code, r) + " (shared world, last)", async (t, w) => { await runCell(t, w, r, w.actors[code], "paid"); }, { order: r.lastOfAll ? 3 : 2 }); continue; }
      push(lateGrp, nameOf("late-keys", code, r), async (t, w) => { await runCell(t, w, r, w.actors[code] ?? fallbackActor(w, code), "paid"); }, { order: 0 });
    }
  }
  for (const [cid, restFn] of [["manual", () => ""], ["summary", (w) => `/z/${w.eid}/summary`], ["settings", (w) => `/z/${w.eid}/settings?_method=PATCH&_body=${enc({ name: "Late" })}`]]) for (const code of ["AIEXP", "AIREV", "HOSTEXP", "HOSTREV"]) {
    push(lateGrp, `late-keys|${ACTOR_NAME[code]} at /ai/<key>/${cid}`, async (t, w) => {
      const key = (w.actors[code].h["x-organizer"] ?? "").replace(/^x-organizer ?/, ""); const before = await snapshot(w); const res = await raw("GET", "/ai/" + key + restFn(w), undefined, {}, t.ip());
      t.check(`${ACTOR_NAME[code]} gets the plain 404 at /ai/`, res.status === 404 && /Not found/i.test(String(res.text)), `HTTP ${res.status} ${String(res.text).slice(0, 100)}`);
      t.check("nothing changed", before === (await snapshot(w)), "state differs");
    }, { order: 0 });
  }

  // ---- (7) abuse: what a stranger can do with a ticket id (ticket ids are PUBLIC in the seat list) --------------------------
  const privateRun = (name, st, need, fn, timeoutMs = 150_000) => out.push({ name, group: null, noMailCheck: true, allowUnfriendly: true, timeoutMs, run: async (t) => { const w = await build(t, st, need); await fn(t, w); } });
  const publicPids = async (w) => ((await A.call("GET", `/api/z/${w.eid}/seats`)).body?.seats ?? []).map((x) => x[1]);
  privateRun("abuse|three strangers post 'the game is over' for other people's tickets: the game must not end", "runA", null, async (t, w) => {
    const pids = await publicPids(w); t.check("the seat list is public and gives the ticket ids", pids.length >= 3, `${pids.length} ids`);
    const l0 = (await w.org.api("GET", `/api/z/${w.eid}/life`)).body;
    for (const pid of pids.slice(0, 3)) { const r = await A.call("POST", `/api/z/${w.eid}/over`, { pid }, {}, { ip: t.ip() }); t.check("the over report from a stranger is refused (no device proof)", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); }
    const l1 = (await w.org.api("GET", `/api/z/${w.eid}/life`)).body;
    t.check("the end of the game was not decided by strangers", l1.endSrc !== "phones", `endSrc ${l0.endSrc} -> ${l1.endSrc}; endMs ${l0.endMs} -> ${l1.endMs}`);
  });
  privateRun("abuse|three strangers post identical 'winner' reports for other people's tickets: nothing may be settled", "runA", null, async (t, w) => {
    const pids = await publicPids(w); const victim = pids[0];
    for (const pid of pids.slice(0, 3)) { const r = await A.call("POST", `/api/z/${w.eid}/vote`, { pid, results: [{ pattern: "early5", ordinal: 1, round: 1, idx: 3, pids: [victim] }] }, {}, { ip: t.ip() }); t.check("a winners report from a stranger is refused (no device proof)", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); }
    const res = (await A.call("GET", `/api/z/${w.eid}/results`)).body?.results ?? [];
    t.check("no winner was settled by the strangers' reports", res.length === 0, JSON.stringify(res).slice(0, 160));
    const pz = (await w.org.api("GET", `/api/z/${w.eid}/prizes`)).body; t.check("no prize row exists for the invented winner", !(pz.prizes ?? pz.winners ?? []).length, JSON.stringify(pz).slice(0, 160));
  });
  privateRun("abuse|a stranger posts two Bogeys against another person's ticket: refused (control: check-in guards this one)", "runA", null, async (t, w) => {
    const pid = w.partPid; const before = await snapshot(w);
    for (let i = 0; i < 2; i++) { const r = await A.call("POST", `/api/z/${w.eid}/bogey`, { pid, pattern: "early5", round: 1 }, {}, { ip: t.ip() }); t.check("a Bogey from a stranger is refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); }
    t.check("no Bogey row was written", before === (await snapshot(w)), diffSnap(before, await snapshot(w)));
  });
  privateRun("abuse|a stranger posts claims for another person's ticket: refused", "runA", null, async (t, w) => {
    const before = await snapshot(w); const r = await A.call("POST", `/api/z/${w.eid}/claims`, { pid: w.partPid, claims: [{ pattern: "early5", idx: 3, round: 1 }] }, {}, { ip: t.ip() });
    t.check("claims from a stranger are refused", r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); t.check("no claim row was written", before === (await snapshot(w)), diffSnap(before, await snapshot(w)));
  });
  for (const via of ["/api/checkout", "/api/payments/test"]) for (const who of ["ANON", "BAD", "PART"]) privateRun(`abuse|${ACTOR_NAME[who]} pays for the draft of another account through ${via}: the draft must stay a draft`, "draft", [who, "ORG"], async (t, w) => {
    const a = fallbackActor(w, who); const before = await snapshot(w);
    const r = await A.call("POST", via, { eid: w.eid, email: "stranger@example.com", org: "Stranger Ltd", country: "IN", pack: 100 }, a.h, { ip: t.ip() });
    const s = (await w.org.summary(w.eid)).body; const ent = await A.sql("SELECT COUNT(*) c FROM entitlement WHERE eid=?", [w.eid]);
    t.check("the answer is not a server error", r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
    t.check("the Organizer's draft is still a draft (nobody can publish it for them)", s.status === "draft", `status "${s.status}" after HTTP ${r.status}`);
    t.check("no pack was bound to the Organizer's game", ent[0].c === 0, `entitlements for the game: ${ent[0].c}`);
    t.check("the Organizer's game rows are unchanged", before === (await snapshot(w)), diffSnap(before, await snapshot(w)));
  });

  // the owner's access log answers only GET (every other method is a plain 404)
  for (const mm of ["PUT", "DELETE", "PATCH", "POST"]) for (const pth of ["/api/owner/audit/access", "/api/owner/audit/sys"]) push(paidGrp2, `method|platform owner key x ${mm} ${pth} (the route is GET)`, async (t, w) => {
    const res = await raw(mm, pth, mm === "DELETE" ? undefined : "{}", w.actors.PLAT.h, t.ip());
    t.check(`the owner's ${pth} refuses ${mm} with a plain 404`, res.status === 404 || res.status === 405, `HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  }, { order: 0 });
  // ---- (8) the same rule must be the same everywhere --------------------------------------------------------------------
  privateRun("rule|a Co-host is told 'credit is for Organizers and Hosts' by one route and shown the credit by another", "draft", ["COH", "ORG", "HOST"], async (t, w) => {
    const gc = await mkGame(t, w.org, { cap: 20, days: 5, name: "Game that is cancelled for credit" }); await w.org.publish(gc.id, mobile(R)); await w.org.pay(gc.id); const cr = await w.org.cancel(gc.id);
    const credit = (await w.org.api("GET", "/api/org/credit")).body; t.check("setup: the account now holds credit", cr.ok && credit.activeTotalInr > 0, `cancel ${cr.status}, credit ${JSON.stringify(credit).slice(0, 100)}`);
    const c = w.actors.COH; const a = await A.call("GET", "/api/org/credit", undefined, c.h); const b = await A.call("GET", `/api/z/${w.eid}/info`, undefined, c.h); const d = await A.call("GET", `/api/z/${w.eid}/cohost`, undefined, c.h);
    t.check("/api/org/credit refuses the Co-host in plain words", a.status === 403, `HTTP ${a.status} ${JSON.stringify(a.body).slice(0, 100)}`);
    const shown = [b.body?.credit, d.body?.credit].filter((x) => typeof x === "number" && x > 0);
    t.check("no other route shows the account's credit to the Co-host", shown.length === 0, `info.credit=${JSON.stringify(b.body?.credit)} cohost.credit=${JSON.stringify(d.body?.credit)} (account credit ${credit.activeTotalInr})`);
  });
  privateRun("rule|erase all data and forget one person must refuse the same way while the game is running", "runA", ["ORG"], async (t, w) => {
    const f = await w.org.api("POST", `/api/z/${w.eid}/forget`, { phone: "9000000001" }); const e = await w.org.api("POST", `/api/z/${w.eid}/erase`, {});
    t.check("forgetting one person while the game runs is refused", f.status === 409 || f.status === 404, `HTTP ${f.status} ${JSON.stringify(f.body).slice(0, 100)}`);
    t.check("erasing everyone while the game runs is refused the same way", e.status >= 400 && e.status < 500, `HTTP ${e.status} ${JSON.stringify(e.body).slice(0, 100)}`);
  });
  privateRun("rule|the Host work link and the AI key must get the same report-link answer", "ended", ["ORG", "AI", "HOST", "HOSTL"], async (t, w) => {
    const ai = await A.call("GET", `/api/z/${w.eid}/reportlink`, undefined, w.actors.AI.h); const hl = await A.call("GET", `/ai/${w.actors.HOSTL.link}/z/${w.eid}/reportlink`); const org = await A.call("GET", `/api/z/${w.eid}/reportlink`, undefined, w.actors.ORG.h);
    t.check("the Organizer's console may get the report address", org.ok, `HTTP ${org.status} ${JSON.stringify(org.body).slice(0, 100)}`);
    t.check("the AI key never receives the report address", ai.body?.url == null, JSON.stringify(ai.body).slice(0, 140));
    t.check("a Host's AI work link never receives the report address either (it opens every name and number)", hl.body?.url == null, `ready=${hl.body?.ready} url=${hl.body?.url ? "<given>" : null}`);
  });
  privateRun("rule|a Host reaches the same game list through the console and through the AI link", "paid", ["HOST", "HOSTL", "ORG"], async (t, w) => {
    const c = await A.call("GET", "/api/history", undefined, w.actors.HOST.h); const l = await A.call("GET", `/ai/${w.actors.HOSTL.link}/history`);
    t.check("the console shows the game list", c.ok, `HTTP ${c.status}`); t.check("the narrow work link does not show the account's game list", l.status === 403 || l.status === 404, `HTTP ${l.status}`);
  });

  // ---- (9) refusal wording: one sentence that tells the person what to do or who can ------------------------------------------
  const MSGQ = [["settings", "PATCH", (w) => `/api/z/${w.eid}/settings`, () => ({ name: "x" })], ["publish", "POST", (w) => `/api/z/${w.eid}/publish`, (w) => ({ email: w.org.email, phone: "9811122233" })], ["cancel", "POST", (w) => `/api/z/${w.eid}/cancel`, () => ({ confirmations: 3 })],
    ["summary", "GET", (w) => `/api/z/${w.eid}/summary`, null], ["participants", "GET", (w) => `/api/z/${w.eid}/participants`, null], ["org/team", "GET", () => "/api/org/team", null], ["org/keys", "GET", () => "/api/org/keys", null], ["whoami", "GET", () => "/api/whoami", null], ["history", "GET", () => "/api/history", null]];
  for (const [rid, m, pf, bf] of MSGQ) for (const code of ["ANON", "PART", "G2", "BAD", "ORGX", "ORGXAI"]) push(paidGrp2, `msgq|${ACTOR_NAME[code]} x ${m} ${rid}: the refusal says what to do or who may`, async (t, w) => {
    const a = fallbackActor(w, code); const res = await A.call(m, pf(w), bf ? bf(w) : undefined, a.h, { ip: t.ip() });
    if (res.status < 400) return t.check("the call was refused (or legitimately allowed for this caller)", true, `HTTP ${res.status}`);
    const e = String(res.body?.error ?? "");
    t.check(`the refusal is more than the bare words "Not allowed."`, !/^not allowed\.?$/i.test(e.trim()), `HTTP ${res.status} "${e}"`);
  }, { order: 0 });

  return out;
}
export const _internals = { ST, ROUTES, expectOf, isDenied, isBiz };
