/* Public certificate check: asks /api/v2/verify/<id> and says what the record holds (nothing personal). */
(function () {
  "use strict";
  var out = document.getElementById("out"), inp = document.getElementById("c");
  var BASE = (new URLSearchParams(location.search).get("api") || "").replace(/\/$/, "");
  function say(lines, ok) { out.textContent = ""; lines.forEach(function (l, i) { var p = document.createElement(i === 0 ? "h2" : "p"); p.textContent = l; if (i === 0) { p.style.color = ok ? "#14633a" : "#9b1c1c"; p.style.fontSize = "1.15rem"; } out.appendChild(p); }); }
  function check(id) {
    if (!/^[A-Za-z0-9]{4,40}$/.test(id)) return say(["Please type the certificate number as printed."], false);
    fetch(BASE + "/api/v2/verify/" + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.valid) say(["This certificate is real.", "Game " + j.game + " · Ticket No. " + j.ticket + " · " + j.prize, "Issued " + new Date(j.issuedMs + 19800000).toISOString().slice(0, 10) + " · record " + j.position + " of " + j.ofTotal + " in this game's signed chain."], true);
      else say([j && j.error ? "This certificate could not be confirmed." : "This certificate could not be confirmed.", (j && j.error) || "Please check the number."], false);
    }, function () { say(["We could not reach the service.", "Please try again in a moment."], false); });
  }
  document.getElementById("f").addEventListener("submit", function (e) { e.preventDefault(); check(inp.value.trim()); });
  var c = new URLSearchParams(location.search).get("c"); if (c) { inp.value = c; check(c); }
})();
