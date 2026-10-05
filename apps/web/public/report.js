/* Corporate Tambola: the engagement report. The e-mailed link opens this page; it fetches the report's data in small pieces and lays the PDF out on THIS device
   (nothing is built on our side), then offers the PDF to save. The link works only until the participants' details are deleted (within 24 hours of the game ending). */
(function () {
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search), EID = q.get("e") || "", KEY = q.get("k") || "";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const draw = (html) => { $app.innerHTML = `<div class="zhead"><b>Corporate Tambola · Report</b></div>` + html; };
  const get = async (part, extra) => {
    const r = await fetch(`/api/report/${encodeURIComponent(EID)}?k=${encodeURIComponent(KEY)}&part=${part}${extra || ""}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status });
    return j;
  };
  const files = [];
  const save = (bytes, name) => { const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); files.push({ url, name }); };
  async function run() {
    if (!EID || !KEY) { draw(`<div class="zcard"><h2>This link is incomplete</h2><p class="zsmall">Please open the link from your e-mail again.</p></div>`); return; }
    draw(`<div class="zcard"><h2>Preparing your report</h2><p class="zsmall" id="pg">Reading the report…</p></div>`);
    const pg = (t) => { const e = document.getElementById("pg"); if (e) e.textContent = t; };
    let head;
    try { head = await get("base"); } catch (e) { draw(`<div class="zcard"><h2>${e.status === 404 ? "This report is no longer available" : "Could not open the report"}</h2><p class="zsmall">${esc(e.message)}</p></div>`); return; }
    const base = head.base, per = Math.max(1, Math.round(head.partSize / head.chunkSize)), people = [];
    for (let i = 0; i < head.chunks; i++) { pg(`Reading the participants… ${Math.min(head.totalPeople, (i + 1) * head.chunkSize)} of ${head.totalPeople}`); people.push(...(await get("people", "&i=" + i)).people); }
    pg("Laying out the PDF on your device…");
    await new Promise((r) => setTimeout(r, 30));
    const parts = Math.max(1, Math.ceil(head.totalPeople / head.partSize));
    if (parts === 1) save(RPT.layoutReport({ ...base, people }), `tambola-report-${EID}.pdf`);
    else {
      const total = parts + 1;
      save(RPT.layoutReport({ ...base, people: [], omitPeople: true, totalPeople: head.totalPeople }), `tambola-report-${EID}-part-1-of-${total}-summary.pdf`);
      for (let k = 0; k < parts; k++) { pg(`Laying out part ${k + 2} of ${total}…`); await new Promise((r) => setTimeout(r, 10)); save(RPT.layoutPeoplePart(base, people.slice(k * head.partSize, (k + 1) * head.partSize), k + 1, parts), `tambola-report-${EID}-part-${k + 2}-of-${total}-people.pdf`); }
    }
    draw(`<div class="zcard"><h2>Your report is ready</h2>
      <p class="zsmall">It was made on this device. Save it now: the participants' details are deleted from our systems by ${esc(new Date(base.personalDeleteAtMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }))} IST, and this report cannot be made after that.</p>
      ${files.map((f) => `<p><a class="zbtn" style="display:inline-flex;text-decoration:none;align-items:center" href="${f.url}" download="${esc(f.name)}">Save ${esc(f.name)}</a></p>`).join("")}
      <p class="zsmall">You can share this link with your co-host. Anyone who has it can read the report, so share it carefully. Open it again later to include any prize you have since marked as given.</p></div>`);
  }
  run().catch((e) => draw(`<div class="zcard"><h2>Something went wrong</h2><p class="zsmall">${esc(e && e.message || "Please try again.")}</p></div>`));
})();
