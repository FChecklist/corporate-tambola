// 1.8.3 (built as 1.8.1): the optional Email ID of an open game is named in the join notice (K4), in the data map and in the privacy page; the Terms/consent version moved to 2026-10-30 everywhere it is pinned.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TEXT from "../src/consent-text.json";
import { TERMS_VERSION } from "../src/brand";

const ROOT = join(import.meta.dir, "../../..");
const rd = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

describe("1.8.3 email notice", () => {
  test("K4 says, conditionally, that an email ID is used only for this game and deleted within 24 hours of the game", () => {
    const a = String((TEXT as any).K4.A);
    expect(a).toContain("If this game asks for my email ID, that is used only for this game and deleted within 24 hours of the game.");
    expect(rd("apps/web/public/consent.js")).toContain(a); // the page shows the exact words the server checks
  });
  test("one version everywhere: consent text, brand, page script, privacy and terms pages", () => {
    expect((TEXT as any).version).toBe("2026-10-30"); expect(TERMS_VERSION).toBe("2026-10-30");
    expect(rd("apps/web/public/consent.js")).toContain('C.version = "2026-10-30"');
    for (const f of ["apps/web/public/privacy.html", "apps/web/public/terms.html"]) { const h = rd(f); expect(h).toContain("Version 2026-10-30"); expect(h).not.toContain("2026-10-15"); }
  });
  test("the data map lists the e-mail as asked only if the organizer switches it on, with its row (sealed, erased with the rest)", () => {
    const doc = rd("docs/PRIVACY_AND_LIFECYCLE.md");
    expect(doc).toMatch(/asked_if_organizer_switches_on: e-mail/);
    expect(doc).toContain("Email ID, typed by the player");
    expect(doc).toContain("`kv email/<id>/` is removed by `erasePersonal`");
    expect(rd("apps/edge/src/lifecycle.ts")).toContain("`email/${eid}/`"); // the erase really removes it
  });
});

describe("1.8.3 old page", () => {
  test("the server's answer to the old consent version says the page is out of date (code consent-required, stale), the answer to a missing tick stays the old sentence", async () => {
    const { consentMissing, STALE_PAGE_MESSAGE } = await import("../src/consent");
    const old = consentMissing({ consent: { v: "2026-10-15", boxes: ["A", "B"] } }, "K4"); expect(old!.status).toBe(400);
    expect(await old!.json()).toEqual({ error: STALE_PAGE_MESSAGE, code: "consent-required", stale: true, kind: "K4", version: TERMS_VERSION });
    expect(STALE_PAGE_MESSAGE).toBe("This page is out of date. Please reload it, then tick the boxes again and join.");
    const none = consentMissing({}, "K4"); expect(await none!.json()).toEqual({ error: "Please tick the box to continue.", code: "consent-required", kind: "K4", version: TERMS_VERSION });
    expect(consentMissing({ consent: { v: TERMS_VERSION, boxes: ["A", "B"] } }, "K4")).toBeNull();
  });
});
