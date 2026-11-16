// The short claim body (1.5.3): round trip, refusal of anything that does not fit, and the size it saves.
import { describe, expect, test } from "bun:test";
import { compactClaim, parseCompactClaim } from "../src/opcodes";

const body = { pid: "ab12cd34ef56", device: "0123456789abcdef0123456789abcdef", claims: [{ pattern: "early5", idx: 37 }] };
describe("short claim body", () => {
  test("round trip gives the same claim; a later round is kept; the text is much shorter than the JSON", () => {
    const t = compactClaim(body)!; expect(t).toBe("k|ab12cd34ef56|0123456789abcdef0123456789abcdef|early5|37|1");
    expect(parseCompactClaim(t)).toEqual(body);
    expect(parseCompactClaim(compactClaim({ ...body, claims: [{ pattern: "full", idx: 5, round: 3 }] })!)).toEqual({ ...body, claims: [{ pattern: "full", idx: 5, round: 3 }] });
    expect(t.length).toBeLessThan(JSON.stringify(body).length - 30);
  });
  test("anything unusual stays in the long (JSON) form: several claims, extra fields, odd characters", () => {
    expect(compactClaim({ ...body, claims: [body.claims[0], body.claims[0]] })).toBeNull();
    expect(compactClaim({ ...body, extra: 1 })).toBeNull();
    expect(compactClaim({ ...body, pid: "a|b" })).toBeNull();
    expect(compactClaim({ ...body, claims: [{ pattern: "Early 5", idx: 1 }] })).toBeNull();
    expect(compactClaim({ ...body, claims: [{ pattern: "top", idx: -1 }] })).toBeNull();
  });
  test("the server side refuses damaged text", () => {
    for (const t of ["", "k|", "x|a|b|top|1|1", "k|a|b|top|1", "k|a|b|top|1|1|9", "k|a|b|top|x|1", "k||b|top|1|1", "k|a|b|TOP|1|1"]) expect(parseCompactClaim(t)).toBeNull();
  });
});
