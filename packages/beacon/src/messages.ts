// The PRE-INSTALLED messages (1.5.2): the words live in the app; the wire carries only codes and numbers. Every message of the claim notices has a code here, so a second language later is a second table
// with the same codes (per-person language, release 1.6.2). `{t}` ticket number, `{p}` prize name, `{n}` a count. MSG_VERSION goes up whenever a code or its meaning changes.
export const MSG_VERSION = 1;
export const MSG: Record<string, string> = {
  "claim.k": "Ticket {t} has claimed {p}. Checking now…",
  "claim.w": "Ticket {t}'s claim was not correct. The game continues.",
  "claim.a": "Ticket {t}'s claim is correct. Congratulations Ticket {t} on winning {p}! \u{1F389} The game continues.",
  "claim.a2": "A claim for {p} is correct. The game continues.",
  "claim.g": "{p} has been won. It is no longer available.",
  "net.reconnecting": "Reconnecting…",
  "net.back": "Back online.",
  "generic": "Something changed in the game.",
};
/** The text of a code (an unknown code gives the safe generic line, never a blank). */
export const say = (code: string, vars: Record<string, string | number> = {}): string => {
  const t = MSG[code] ?? MSG["generic"]!;
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
};
