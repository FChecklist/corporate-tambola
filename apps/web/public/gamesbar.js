/* The Corporate Games bar: a slim bar at the top of every public page of Corporate Tambola that links to the other Corporate Games and to the Corporate Games home page.
   The home page link carries ?from=tambola so the visitor can come back with one tap. Plain links only; nothing is sent anywhere. */
(function () {
  if (document.querySelector(".cg-bar")) return;
  var GAMES = [["Tambola", "https://corporate-tambola.pages.dev/", "tambola"], ["Bingo", "https://corporate-bingo.pages.dev/", "bingo"], ["Tic Tac Toe", "https://corporate-tic-tac-toe.pages.dev/", "tictactoe"], ["Snakes and Ladders", "https://corporate-snakes-and-ladders.pages.dev/", "snakes"], ["Luck by Chance", "https://corporate-luck-by-chance.pages.dev/", "luck"]];
  var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/gamesbar.css"; document.head.appendChild(l);
  var bar = document.createElement("div"); bar.className = "cg-bar";
  var wrap = document.createElement("div"); wrap.className = "cg-wrap"; bar.appendChild(wrap);
  var home = document.createElement("a"); home.className = "cg-home"; home.href = "https://corporate-games.pages.dev/?from=tambola"; home.textContent = "Corporate Games"; wrap.appendChild(home);
  var line = document.createElement("span"); line.className = "cg-line"; line.textContent = "closed group, online engagement"; wrap.appendChild(line);
  var nav = document.createElement("nav"); nav.setAttribute("aria-label", "Corporate Games"); wrap.appendChild(nav);
  GAMES.forEach(function (g) {
    var a = document.createElement("a"); a.href = g[1]; a.textContent = g[0];
    if (g[2] === "tambola") a.setAttribute("aria-current", "true");
    nav.appendChild(a);
  });
  document.body.insertBefore(bar, document.body.firstChild);
})();
