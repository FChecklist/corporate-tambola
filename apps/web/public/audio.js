/*
 * Number calling audio (owner decision): the voice only says the number, twice.
 *   24 -> "Next number is two four, twenty-four. Number twenty-four."     7 -> "Next number is seven. Number seven."
 * Plan: 90 pre-recorded clips (one fixed female Indian-English voice) are downloaded once to the device and
 * cached (Cache Storage), decoded into memory, and played when the tiny {call} message arrives.
 * Until the recorded clips exist, this falls back to the browser's own speech synthesis with the same words.
 */
(function () {
  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const words = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
  const digits = (n) => String(n).split("").map((d) => ONES[+d]).join(" ");
  const phrase = (n) => (n < 10 ? `Next number is ${words(n)}. Number ${words(n)}.` : `Next number is ${digits(n)}, ${words(n)}. Number ${words(n)}.`);

  const VERSION = "v1-en-in-f";
  const A = (window.TBAudio = { phrase, VERSION, enabled: true, unlocked: false, clips: new Map(), ctx: null, mode: "speech" });

  // Call from a tap (Join audio). Phones only allow sound after a tap.
  A.unlock = async () => {
    try {
      A.ctx = A.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (A.ctx.state === "suspended") await A.ctx.resume();
      A.unlocked = true;
      if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
    } catch { A.unlocked = true; }
    return A.unlocked;
  };

  // Download and cache the clips once; returns how many are ready. Safe to call every visit.
  A.preload = async (onProgress) => {
    if (!("caches" in window)) return 0;
    let ok = 0;
    try {
      const cache = await caches.open("tb-audio-" + VERSION);
      for (let n = 1; n <= 90; n++) {
        const url = `/audio/${VERSION}/${String(n).padStart(2, "0")}.m4a`;
        let res = await cache.match(url);
        if (!res) { try { const r = await fetch(url); if (r.ok) { await cache.put(url, r.clone()); res = r; } } catch {} }
        if (res && A.ctx) { try { A.clips.set(n, await A.ctx.decodeAudioData(await res.arrayBuffer())); ok++; } catch {} }
        else if (res) ok++;
        if (onProgress && n % 10 === 0) onProgress(n / 90);
        if (!res && n === 1) break; // no recorded pack on the server yet: stay on speech synthesis
      }
    } catch {}
    A.mode = A.clips.size >= 90 ? "clips" : "speech";
    return ok;
  };

  A.play = (n) => {
    if (!A.enabled) return;
    const clip = A.clips.get(n);
    if (clip && A.ctx) { const s = A.ctx.createBufferSource(); s.buffer = clip; s.connect(A.ctx.destination); s.start(); return; }
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(phrase(n));
      u.rate = 0.82; u.pitch = 1.05; u.lang = "en-IN";
      const vs = speechSynthesis.getVoices();
      const pick = vs.find((v) => v.lang === "en-IN" && /female|heera|neerja|veena|raveena|natural|google/i.test(v.name)) || vs.find((v) => v.lang === "en-IN") || vs.find((v) => /^en/.test(v.lang) && /female|zira|samantha|natural/i.test(v.name));
      if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch {}
  };
  // A spoken message (the organizer's announcement, or the sound check). Uses the phone's own voice, so it costs nothing.
  A.say = (text, lead = "Message from the organizer. ") => {
    if (!A.enabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(lead + text); u.rate = 0.9; u.lang = "en-IN";
      const vs = speechSynthesis.getVoices(); const pick = vs.find((v) => v.lang === "en-IN") || vs.find((v) => /^en/.test(v.lang)); if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch {}
  };
  A.test = () => { A.unlock(); A.play(24); };
  A.stop = () => { try { window.speechSynthesis && speechSynthesis.cancel(); } catch {} };
})();
