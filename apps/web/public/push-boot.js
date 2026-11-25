/* Corporate Tambola: the "Yes, notify me when this game begins" button on the player page (z.html), made with the notification service (corporate-push, client 0.2.0).
 *
 * DARK UNTIL ONE VALUE IS SET. PUSH_API below is empty today. While it is empty this file does nothing at all: no button, no style file, no script file,
 * no request to anyone. To switch the button on, put the real https address of the notification service between the quotes (for example "https://push.example.com":
 * the address only, no path, no slash at the end) and deploy. pages/build.mjs reads the SAME value and adds that one address to connect-src of the player page;
 * script-src stays 'self'. Nothing else needs to change on the page.
 *
 * What it does when the address is set:
 *   - takes the game id from the game link (?e=<id>, the same id z.js uses) and puts one block under the game, with the privacy link next to the button;
 *   - the block loads the client files as they are (push-optin.js and push-optin.css, never edited here);
 *   - the browser's own permission question opens ONLY after the person taps the button. Never on page load;
 *   - when the game is over (z.js sets data-game-over on <html> and fires "ct:game-over") the block offers "Keep notifying me about new games".
 */
(function () {
  "use strict";
  var PUSH_API = ""; /* <<< THE ONE SETTING. Empty = dark. */

  // A real https address of a host with a dot in its name, optionally a port. No path, no query, no spaces, no placeholder text.
  function realAddress(v) {
    if (typeof v !== "string") return "";
    var a = v.trim().replace(/\/+$/, "");
    return /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?(:[0-9]{1,5})?$/i.test(a) ? a : "";
  }
  var api = realAddress(PUSH_API);
  if (!api) return; // dark: nothing is drawn, nothing is loaded, nothing is requested
  if (window.__ctPush) return;
  window.__ctPush = true;
  if (window.__CT_DEMO) return; // the free demo has no real game to be told about

  var q = new URLSearchParams(location.search);
  var gameId = (q.get("e") || location.hash.replace(/^#/, "") || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(gameId)) return; // no game link: no button

  function over() { return document.documentElement.getAttribute("data-game-over") === "1"; }

  var box = document.createElement("div");
  box.id = "ct-push";
  box.setAttribute("data-push-optin", "");
  box.setAttribute("data-push-site", "game");
  box.setAttribute("data-push-game-id", gameId);
  box.setAttribute("data-push-api", api);
  box.setAttribute("data-push-sw", "/zsw.js"); // the real service worker of this site (pwa.js registers it); used only if none is registered yet
  box.setAttribute("data-push-privacy", "/privacy.html");
  box.setAttribute("data-push-ended", over() ? "true" : "false");

  var anchor = document.querySelector("aside.mkown");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
  else document.body.appendChild(box);

  // The game ended after the page was drawn: tell the block, so it offers "Keep notifying me about new games".
  document.addEventListener("ct:game-over", function () {
    box.setAttribute("data-push-ended", "true");
    try { box.dispatchEvent(new CustomEvent("corporatepush:game-ended")); } catch (e) { /* the attribute is enough on the next page load */ }
  });

  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/push-optin.css";
  document.head.appendChild(css);
  var js = document.createElement("script");
  js.src = "/push-optin.js";
  js.defer = true;
  document.body.appendChild(js);
})();
