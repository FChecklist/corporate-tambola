// The top menu on a phone or narrow window opens and closes with the Menu button (Escape also closes it). Without this script the six links simply stay visible as a list.
(function () {
  var d = document.documentElement, b = document.getElementById("ctBurger"), m = document.getElementById("ctMenu");
  if (!b || !m) return;
  d.classList.add("ct-js");
  function set(o) { b.setAttribute("aria-expanded", String(o)); m.classList.toggle("open", o); }
  b.addEventListener("click", function () { set(b.getAttribute("aria-expanded") !== "true"); });
  m.addEventListener("click", function (e) { var t = e.target; if (t && t.closest && t.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && b.getAttribute("aria-expanded") === "true") { set(false); b.focus(); } });
  document.addEventListener("click", function (e) { var t = e.target; if (b.getAttribute("aria-expanded") === "true" && t && t.closest && !t.closest(".ct-nav")) set(false); });
})();
