/* A pasted or uploaded list of IDs, read in the browser. Extra columns (serial number, name) are dropped here and never leave the browser;
   a column of e-mail addresses or mobile numbers is ignored and never saved. Only the cleaned ID column is sent. One ID format everywhere:
   English letters and digits only, upper case, leading zeros kept, at most 30 characters (same rule as the server's cleanEmpId). */
(function (root) {
  var HEAD = /\b(id|emp|employee|associate|vendor|member|code|no\.?|number|serial|sl|sr|s\.?\s?no|name|location|e-?mail|mobile|phone)\b/i;
  var IDHEAD = /(\bid\b|emp|associate|vendor|member|code)/i;
  var NAMEHEAD = /name/i;
  var FOREIGN = /[\p{L}\p{N}]/u;
  function clean(raw) {
    var t = String(raw == null ? "" : raw).normalize("NFKC");
    if (/@/.test(t)) return { bad: "email" };
    if (FOREIGN.test(t.replace(/[A-Za-z0-9]/g, ""))) return { bad: "english" };
    var c = t.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!c) return { blank: true };
    if (c.length > 30) return { bad: "long" };
    return { id: c };
  }
  function splitRows(text) {
    var lines = String(text == null ? "" : text).replace(/^﻿/, "").split(/\r?\n/);
    var delim = lines.some(function (l) { return l.indexOf("\t") >= 0; }) ? "\t" : lines.some(function (l) { return l.indexOf(";") >= 0; }) ? ";" : ",";
    return lines.map(function (l) { return l.split(delim).map(function (c) { return c.trim().replace(/^"(.*)"$/, "$1").trim(); }); });
  }
  function isMobile(v) { var d = v.replace(/[\s()-]/g, ""); return /^\+\d{8,15}$/.test(d) || /^\d{10,15}$/.test(d); }
  function kindOf(vals) {
    if (!vals.length) return { kind: "empty", score: -9 };
    var n = vals.length, em = vals.filter(function (v) { return /[@＠]/.test(v); }).length;
    if (em * 2 >= n) return { kind: "email", score: -9 };
    if (vals.filter(isMobile).length * 2 >= n) return { kind: "mobile", score: -9 };
    if (vals.every(function (v) { return /^\d+$/.test(v); })) {
      var nums = vals.map(Number), seq = nums.length > 1 && nums.every(function (x, i) { return x === nums[0] + i; }) && nums[0] <= 1;
      if (seq || (nums.length === 1 && nums[0] <= 1)) return { kind: "serial", score: -5 };
      return { kind: "id", score: 1 };
    }
    if (vals.filter(function (v) { return /^[\p{L}][\p{L} .'-]*$/u.test(v) && !/\d/.test(v); }).length * 5 >= n * 4) return { kind: "name", score: -4 };
    return { kind: "id", score: 2 + (vals.filter(function (v) { return /[A-Za-z]/.test(v) && /\d/.test(v); }).length * 2 >= n ? 2 : 0) };
  }
  var LABEL = { serial: "Serial", name: "Name", id: "Employee ID", email: "E-mail", mobile: "Mobile", empty: "Empty" };
  /** parse(text, forcedCol): forcedCol (1-based) is the person's pick in the dropdown. */
  function parse(text, forcedCol) {
    var rows = splitRows(text), width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0), blank = 0, data = [];
    var head = null;
    var first = rows.find(function (r) { return r.some(function (c) { return c !== ""; }); });
    if (first && first.some(function (c) { return HEAD.test(c); }) && !first.some(function (c) { return /\d/.test(c); })) head = first;
    var started = false;
    rows.forEach(function (r) {
      if (!r.some(function (c) { return c !== ""; })) { blank++; return; }
      if (head && r === head && !started) { started = true; return; }
      started = true; data.push(r);
    });
    var cols = [];
    for (var c = 0; c < width; c++) {
      var vals = data.map(function (r) { return r[c] || ""; }).filter(function (v) { return v !== ""; });
      var k = kindOf(vals); if (head && head[c]) k.label = head[c]; else k.label = LABEL[k.kind];
      if (head && head[c] && NAMEHEAD.test(head[c]) && k.kind === "id") { k.kind = "name"; k.score = -4; }
      if (head && head[c] && IDHEAD.test(head[c]) && !NAMEHEAD.test(head[c]) && k.kind !== "email" && k.kind !== "mobile") { k.kind = "id"; k.score = 10; }
      cols.push(k);
    }
    var idCol = -1, ask = false;
    if (forcedCol && forcedCol >= 1 && forcedCol <= width) idCol = forcedCol - 1;
    else if (width === 1) idCol = cols[0].kind === "email" || cols[0].kind === "mobile" ? -1 : 0;
    else {
      var best = -1, tie = false;
      cols.forEach(function (k, i) { if (k.score < 0) return; if (best < 0 || k.score > cols[best].score) { best = i; tie = false; } else if (k.score === cols[best].score) tie = true; });
      if (best >= 0 && !tie) idCol = best; else { ask = true; idCol = best >= 0 ? best : -1; }
    }
    var ignored = cols.map(function (k, i) { return { col: i + 1, kind: k.kind }; }).filter(function (x) { return x.kind === "email" || x.kind === "mobile"; });
    var seen = {}, ids = [], repeated = 0, invalid = [], blankCells = 0;
    if (idCol >= 0 && !(cols[idCol] && (cols[idCol].kind === "email" || cols[idCol].kind === "mobile") && !forcedCol)) {
      data.forEach(function (r) {
        var raw = r[idCol] || "", v = clean(raw);
        if (v.blank) { blankCells++; return; }
        if (v.bad) { invalid.push({ raw: raw, why: v.bad }); return; }
        if (seen[v.id]) { repeated++; return; } seen[v.id] = 1; ids.push(v.id);
      });
    }
    var labels = cols.map(function (k) { return k.label; });
    return { columns: width, labels: labels, header: !!head, idCol: idCol >= 0 ? idCol + 1 : 0, ask: ask || idCol < 0, ignored: ignored, ids: ids, ready: ids.length, blank: blank + blankCells, repeated: repeated, invalid: invalid, preview: ids.slice(0, 3) };
  }
  function describe(r) {
    var line = "Found " + r.columns + " column" + (r.columns === 1 ? "" : "s") + ": " + r.labels.join(", ") + (r.idCol ? ". Using column " + r.idCol + " as the Employee ID." : ". Please choose the Employee ID column.");
    var note = r.ignored.length ? "A column with e-mail addresses (or mobile numbers) was found. It is ignored and not saved. Only Employee IDs are needed." : "";
    var counts = r.ready + " Employee ID" + (r.ready === 1 ? "" : "s") + " ready, " + r.blank + " blank row" + (r.blank === 1 ? "" : "s") + " skipped, " + r.repeated + " repeated Employee ID" + (r.repeated === 1 ? "" : "s") + " removed" + (r.invalid.length ? ", " + r.invalid.length + " not usable" : "") + ".";
    return { line: line, note: note, counts: counts, preview: r.preview.join(", ") };
  }
  var api = { parse: parse, describe: describe, clean: clean, HINT: "Paste only the Employee, Associate, Vendor or Member IDs from your Excel sheet. Please do not paste e-mail addresses, names, mobile numbers or any other details." };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ZIdList = api;
})(typeof window !== "undefined" ? window : this);
