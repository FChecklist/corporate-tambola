// The one place that builds an e-mail carrying an AI work link (organizer: cta_, co-host: cth_).
// Rule: a link to the AI work manual travels ONLY in these dedicated mails, to the organizer alone. No other mail (publish, payment, reminders, invoices,
// report, partners, invitations) and no report/PDF/guest page may carry one: mail scanners open links, forwarded mails leak them, and the key is a credential.
// The paste text is shown as plain text in a box, never as a hyperlink.

import { aiPaste } from "./ai-link";

export const AI_WARNING = "IMPORTANT - DO NOT FORWARD YOUR AI WORK LINK OR THIS EMAIL TO ANYONE AS IT CONTAINS YOUR PERSONALIZED AI WORK LINK";
export const HOST_WARNING = "IMPORTANT - DO NOT FORWARD THIS EMAIL. GIVE THE CO-HOST LINK ONLY TO THE ONE PERSON YOU CHOSE AS CO-HOST, AS IT CONTAINS A PERSONALIZED CO-HOST AI WORK LINK";
export const AI_SUBJECT = "Your personal AI work link - Corporate Tambola";
export const HOST_SUBJECT = "A co-host AI work link for your Corporate Tambola account";

export interface BuiltMail { subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const AI_CAN = "Whatever you can do in your console: create the engagement, set the time, speed, limit, tickets, rewards and brand breaks, load your guest list, send messages to your guests, read results and track prizes.";
const AI_STAYS = "Four things stay with you, always: payment, pressing Publish (you confirm your own e-mail and mobile number), erasing participant data, and pausing or stopping a running game. The AI can only ask; you approve in your console.";
const HOST_CAN = "Watch the game, send a short message to every guest's phone, and tick prizes as handed over.";
const HOST_STAYS = "Nothing else: it cannot change settings, people, payment or data, and it cannot pause, stop or erase.";

function shell(opts: { warning: string; title: string; intro: string; pasteLabel: string; paste: string; steps: string[]; can: string; stays: string; replace: string; footer: string }): { text: string; html: string } {
  const text = [
    opts.warning, "", opts.title.toUpperCase(), "", opts.intro, "",
    opts.pasteLabel, "--------------------------------", opts.paste, "--------------------------------", "",
    "WHAT TO DO", ...opts.steps.map((s, i) => `${i + 1}. ${s}`), "",
    "WHAT IT CAN DO", opts.can, "", "WHAT STAYS WITH A PERSON", opts.stays, "",
    "IF YOU LOSE THE LINK, OR THINK SOMEONE ELSE HAS IT", opts.replace, "",
    opts.footer, "", opts.warning, "",
  ].join("\n");
  const warn = (pad: string) => `<tr><td style="padding:${pad};"><div style="background:#fdecea;border:2px solid #c0392b;border-radius:8px;padding:12px 14px;color:#b71c1c;font-weight:700;font-size:14px;line-height:1.4;text-align:center;">${esc(opts.warning)}</div></td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#f4efe3;font-family:Arial,Helvetica,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe3;"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;border:1px solid #e6d9b8;">
<tr><td style="background:#1b2a41;border-radius:10px 10px 0 0;padding:14px 22px;color:#f1d58a;font-size:13px;letter-spacing:.08em;font-weight:700;">CORPORATE TAMBOLA</td></tr>
${warn("16px 22px 0")}
<tr><td style="padding:18px 22px 4px;"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#1b2a41;">${esc(opts.title)}</h1><p style="margin:10px 0 0;font-size:15px;line-height:1.5;">${esc(opts.intro)}</p></td></tr>
<tr><td style="padding:14px 22px 6px;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8a6a1a;margin-bottom:6px;">${esc(opts.pasteLabel)}</div>
<div style="background:#fffaf0;border:2px dashed #c9a24a;border-radius:8px;padding:14px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.5;color:#111;white-space:pre-wrap;overflow-wrap:anywhere;text-decoration:none;">${esc(opts.paste)}</div>
<div style="font-size:12px;color:#666;margin-top:6px;">This is plain text on purpose, not a clickable link. Select it, copy it, and paste it into your AI chat.</div></td></tr>
<tr><td style="padding:14px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8a6a1a;margin-bottom:6px;">WHAT TO DO</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${opts.steps.map((s, i) => `<tr><td valign="top" width="30" style="padding:4px 0;"><div style="width:24px;height:24px;border-radius:12px;background:#1b2a41;color:#f1d58a;text-align:center;line-height:24px;font-size:13px;font-weight:700;">${i + 1}</div></td><td style="padding:4px 0;font-size:15px;line-height:1.45;">${esc(s)}</td></tr>`).join("")}</table></td></tr>
<tr><td style="padding:14px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#0b6b3a;margin-bottom:4px;">WHAT IT CAN DO</div><div style="font-size:14px;line-height:1.5;">${esc(opts.can)}</div></td></tr>
<tr><td style="padding:12px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8a4b00;margin-bottom:4px;">WHAT STAYS WITH A PERSON</div><div style="font-size:14px;line-height:1.5;">${esc(opts.stays)}</div></td></tr>
<tr><td style="padding:12px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#555;margin-bottom:4px;">IF YOU LOSE THE LINK, OR THINK SOMEONE ELSE HAS IT</div><div style="font-size:14px;line-height:1.5;">${esc(opts.replace)}</div></td></tr>
<tr><td style="padding:12px 22px 6px;font-size:12px;color:#666;line-height:1.5;">${esc(opts.footer)}</td></tr>
${warn("8px 22px 20px")}
</table></td></tr></table></body></html>`;
  return { text, html };
}

/** The organizer's dedicated AI-link mail: sent when the account is created and when the link is replaced, and nowhere else. */
export function aiLinkMail(origin: string, key: string, why: "start" | "replace" = "start"): BuiltMail {
  const { text, html } = shell({
    warning: AI_WARNING,
    title: why === "replace" ? "Your NEW personal AI work link" : "Your personal AI work link",
    intro: why === "replace" ? "You replaced your AI work link. The new one is below. The old link stopped working at once." : "Let a free AI assistant do the work for you. Everything it needs is behind the link in the box below.",
    pasteLabel: "COPY EVERYTHING IN THIS BOX",
    paste: aiPaste(origin, key),
    steps: [
      "Copy everything in the box above.",
      "Paste it into any AI chat: ChatGPT, Claude, Gemini, Grok, DeepSeek, z.ai or any other.",
      "Answer its questions, one at a time, in your own words. It does all the work for you.",
    ],
    can: AI_CAN, stays: AI_STAYS,
    replace: "Open your console and press \"Replace my AI link\" (sign in with your e-mailed 6-digit code if asked). The old link stops working at once and a new one is made and e-mailed to you.",
    footer: "We never put this link in any other e-mail (publish, payment, reminders, invoices, reports), and it is not in any report or guest page. If you ever see it somewhere else, replace it.",
  });
  return { subject: AI_SUBJECT, text, html };
}

/** A co-host's link, e-mailed to the organizer who made it. Role: watch and announce only. `owner` names whose engagements it belongs to. */
export function coHostLinkMail(origin: string, key: string, owner: string): BuiltMail {
  const { text, html } = shell({
    warning: HOST_WARNING,
    title: "A co-host AI work link",
    intro: `This link belongs to the Corporate Tambola engagements of ${owner}. It is for a co-host: a watch and announce role only. Hand it over by pasting the box to the person you chose, not by forwarding this e-mail.`,
    pasteLabel: "THE CO-HOST PASTES THIS INTO THEIR AI CHAT",
    paste: aiPaste(origin, key).replace("MY OWN Corporate Tambola account. I am the owner,", `the Corporate Tambola account of ${owner}. I am their co-host,`),
    steps: [
      "Copy everything in the box above and give it only to your co-host.",
      "They paste it into any AI chat: ChatGPT, Claude, Gemini, Grok, DeepSeek, z.ai or any other.",
      "They ask it, in plain words, how the game is going or to message the guests.",
    ],
    can: HOST_CAN, stays: HOST_STAYS,
    replace: "Open your console, retire the co-host key in the Keys card, and make a new one. The old link stops working at once.",
    footer: "A co-host link is a key to watching and announcing for your engagements. It is never put in a publish, payment, report or guest e-mail.",
  });
  return { subject: HOST_SUBJECT, text, html };
}
