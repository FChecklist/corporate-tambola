// Makes a SAMPLE engagement report from invented people, to look at the layout. Usage: bun run tools/sim/sample-report.ts [out.pdf]
import { layoutReport, type ReportData, type ReportPerson, type ReportPrize } from "../../apps/edge/src/report-layout";
const out = process.argv[2] ?? "sample-report.pdf";
const first = ["Asha", "Bala", "Chandra", "Deepa", "Eshan", "Farah", "Gopal", "Hema", "Imran", "Jaya", "Kiran", "Latha", "Manoj", "Neha", "Omar", "Priya", "Qadir", "Rohit", "Sneha", "Tarun", "Uma", "Vijay", "Wasim", "Yamini", "Zoya"];
const last = ["Sharma", "Nair", "Iyer", "Gupta", "Khan", "Reddy", "Mehta", "Das", "Patel", "Singh"];
const start = Date.UTC(2026, 9, 3, 13, 30, 0); // 19:00 IST
const first1 = start + 120_000, callMs = 6_000;
const people: ReportPerson[] = [];
for (let i = 1; i <= 42; i++) {
  const late = i > 34;
  people.push({
    seat: i, name: i === 7 ? "अनिता वर्मा" : `${first[i % first.length]} ${last[(i * 3) % last.length]}`, phone: `98765${String(40000 + i * 37).slice(-5)}`,
    joinedMs: late ? first1 + (i - 33) * 70_000 : start - (45 - i) * 60_000 * 2 + (i % 5) * 7000, late, role: i === 1 ? "organizer" : i === 2 ? "host" : i === 3 ? "co-host" : null,
    invitedBy: i <= 6 ? null : i <= 20 ? ((i % 4) + 1) : i - 14, onRoster: i <= 25, joined: true,
  });
}
people.push({ seat: null, name: "Zubin Contractor", phone: "9876599999", joinedMs: null, late: false, role: null, invitedBy: null, onRoster: true, joined: false });
const w = (seat: number, call: number, verified = true) => { const p = people.find((x) => x.seat === seat)!; return { seat, name: p.name, phone: p.phone, role: p.role, verified, callNo: call, atMs: first1 + (call - 1) * callMs }; };
const prizes: ReportPrize[] = [
  { round: 1, label: "Early Five", text: "Gift hamper", winners: [w(12, 17)] }, { round: 1, label: "Top Line", text: "Movie tickets for two", winners: [w(5, 33), w(21, 33)] },
  { round: 1, label: "Middle Line", text: "Coffee voucher", winners: [w(2, 41, true)] }, { round: 1, label: "Bottom Line", text: "Lunch for the team", winners: [w(30, 47, false)] },
  { round: 1, label: "Four Corners", text: "Power bank", winners: [] }, { round: 1, label: "Star", text: "Desk plant", winners: [w(8, 62)] },
  { round: 1, label: "Full House", text: "Weekend getaway voucher", winners: [w(27, 81)] },
];
const timeline = Array.from({ length: 10 }, (_, k) => { const callNo = k * 10; const at = first1 + callNo * callMs; const present = people.filter((p) => p.joined && (p.joinedMs ?? 0) <= at).length; return { callNo, atMs: at, present, late: people.filter((p) => p.joined && p.late && (p.joinedMs ?? 0) <= at).length }; });
const end = first1 + 81 * callMs + 5000;
const data: ReportData = {
  engagementId: "SAMPLE-ANNUAL-DAY", organizerEmail: "organizer@yourcompany.example", sentAtMs: end + 8 * 60_000,
  scheduledMs: start, firstNumberMs: first1, endMs: end, endReason: "Every prize was awarded (the last prize, Full House, at number 81 of 90).", wasHeld: false,
  rounds: 1, callSeconds: 6, ticketsPerPerson: 1, cap: 100, inviteOnly: false, numbersCalled: 81, people, prizes,
  lucky: [{ title: "Scratch and win", winners: [w(9, 45), w(18, 45), w(33, 45)].map((x) => ({ ...x })) }],
  timeline, breaks: [{ after: 45, kind: "lucky", title: "Scratch and win" }],
  personalDeleteAtMs: end + 22 * 3_600_000, fullDeleteAtMs: Date.UTC(2027, 9, 3, 18, 30, 0),
};
const pdf = layoutReport(data);
await Bun.write(out, pdf);
console.log(`wrote ${out}: ${pdf.length} bytes`);
