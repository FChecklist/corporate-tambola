// The one setting of the "notify me when this game begins" button: PUSH_API in apps/web/public/push-boot.js (empty = dark).
// pages/build.mjs reads it from there so the page's connection rule (connect-src) names the notification service ONLY when the button is switched on.
// The same check is used by the button itself (push-boot.js `realAddress`) and by the tests, so the two can never disagree about what counts as set.

/** A real https address: a host with a dot in its name, optionally a port. No path, no query, no spaces, no placeholder text. Returns it without a trailing slash, or "" when it is not one. */
export function realPushAddress(v) {
  if (typeof v !== "string") return "";
  const a = v.trim().replace(/\/+$/, "");
  return /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?(:[0-9]{1,5})?$/i.test(a) ? a : "";
}

/** The value of PUSH_API in the text of push-boot.js ("" when the line is missing or empty). */
export function pushApiFromSource(text) {
  const m = /^\s*var PUSH_API = "([^"\n]*)";/m.exec(String(text));
  return m ? realPushAddress(m[1]) : "";
}

/** Adds the notification service to the connection rule of a Content-Security-Policy, and nothing else: with no address the policy is returned unchanged; script-src is never touched. */
export function withPushConnect(csp, api) {
  const a = realPushAddress(api);
  if (!a) return csp;
  if (!csp.includes("connect-src 'self'")) throw new Error("withPushConnect: the policy has no connect-src 'self'");
  return csp.replace("connect-src 'self'", "connect-src 'self' " + a);
}
