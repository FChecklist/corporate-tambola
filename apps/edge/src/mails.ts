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

import { BRAND, esc, footerText, pageHtml } from "./brand";

const AI_CAN = "Whatever you can do in your console: create the engagement, set the time, speed, limit, tickets, rewards and brand breaks, load your guest list, send messages to your guests, read results and track prizes.";
const AI_STAYS = "Four things stay with you, always: payment, pressing Publish (you confirm your own e-mail and mobile number), erasing participant data, and pausing or stopping a running game. The AI can only ask; you approve in your console.";
const HOST_CAN = "Watch the game, send a short message to every guest's phone, and tick prizes as handed over.";
const HOST_STAYS = "Nothing else: it cannot change settings, people, payment or data, and it cannot pause, stop or erase.";

function shell(opts: { origin: string; warning: string; title: string; intro: string; pasteLabel: string; expiry: string; button: { label: string; url: string; note: string }; paste: string; steps: string[]; can: string; stays: string; replace: string; footer: string }): { text: string; html: string } {
  const text = [
    opts.warning, "", opts.title.toUpperCase(), "", opts.intro, "", opts.expiry, "", `${opts.button.label.toUpperCase()}: ${opts.button.url}`, opts.button.note, "",
    opts.pasteLabel, "--------------------------------", opts.paste, "--------------------------------", "",
    "WHAT TO DO", ...opts.steps.map((s, i) => `${i + 1}. ${s}`), "",
    "WHAT IT CAN DO", opts.can, "", "WHAT STAYS WITH A PERSON", opts.stays, "",
    "IF YOU LOSE THE LINK, OR THINK SOMEONE ELSE HAS IT", opts.replace, "",
    opts.footer, "", opts.warning, "", footerText(opts.origin), "",
  ].join("\n");
  const warn = (pad: string) => `<tr><td style="padding:${pad};"><div style="background:#fdecea;border:2px solid #c0392b;border-radius:8px;padding:12px 14px;color:#b71c1c;font-weight:700;font-size:14px;line-height:1.4;text-align:center;">${esc(opts.warning)}</div></td></tr>`;
  const html = pageHtml(opts.title, `${warn("16px 22px 0")}
<tr><td style="padding:18px 22px 4px;"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#0B3D91;">${esc(opts.title)}</h1><p style="margin:10px 0 0;font-size:15px;line-height:1.5;">${esc(opts.intro)}</p></td></tr>
<tr><td style="padding:12px 22px 0;"><div style="background:#FBF0D9;border:1px solid #E0B872;border-radius:8px;padding:10px 14px;font-size:14px;line-height:1.45;color:#5A3A00;"><b>${esc(opts.expiry)}</b></div></td></tr>
<tr><td align="center" style="padding:16px 22px 4px;"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#E0B872;color:#0B3D91;font-weight:700;font-size:16px;text-decoration:none;padding:13px 26px;border-radius:8px;">${esc(opts.button.label)}</a><div style="font-size:12px;color:#666;margin-top:8px;line-height:1.45;">${esc(opts.button.note)}</div></td></tr>
<tr><td style="padding:14px 22px 6px;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8A5A00;margin-bottom:6px;">${esc(opts.pasteLabel)}</div>
<div style="background:#FBF6EC;border:2px dashed #E0B872;border-radius:8px;padding:14px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.5;color:#111;white-space:pre-wrap;overflow-wrap:anywhere;text-decoration:none;">${esc(opts.paste)}</div>
<div style="font-size:12px;color:#666;margin-top:6px;">The link in the box is plain text on purpose (nothing here can be clicked to open it). Select it, copy it, and paste it into your AI chat.</div></td></tr>
<tr><td style="padding:14px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8A5A00;margin-bottom:6px;">WHAT TO DO</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${opts.steps.map((s, i) => `<tr><td valign="top" width="30" style="padding:4px 0;"><div style="width:24px;height:24px;border-radius:12px;background:#0B3D91;color:#F3D9A4;text-align:center;line-height:24px;font-size:13px;font-weight:700;">${i + 1}</div></td><td style="padding:4px 0;font-size:15px;line-height:1.45;">${esc(s)}</td></tr>`).join("")}</table></td></tr>
<tr><td style="padding:14px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#0b6b3a;margin-bottom:4px;">WHAT IT CAN DO</div><div style="font-size:14px;line-height:1.5;">${esc(opts.can)}</div></td></tr>
<tr><td style="padding:12px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8a4b00;margin-bottom:4px;">WHAT STAYS WITH A PERSON</div><div style="font-size:14px;line-height:1.5;">${esc(opts.stays)}</div></td></tr>
<tr><td style="padding:12px 22px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#555;margin-bottom:4px;">IF YOU LOSE THE LINK, OR THINK SOMEONE ELSE HAS IT</div><div style="font-size:14px;line-height:1.5;">${esc(opts.replace)}</div></td></tr>
<tr><td style="padding:12px 22px 6px;font-size:12px;color:#666;line-height:1.5;">${esc(opts.footer)}</td></tr>
${warn("8px 22px 20px")}`, opts.origin);
  return { text, html };
}

/** The organizer's dedicated AI-link mail: sent when the account is created and when the link is replaced, and nowhere else. */
const istStamp = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
export const LINK_MAIL_TTL_MS = 24 * 3_600_000;
const FRESH = "Press \"Show my AI work link\" in this e-mail (or \"Get a fresh AI link\" in your console) for a new one. Your own long-lasting link is shown only after you sign in, never in an e-mail.";
export function aiLinkMail(origin: string, key: string, why: "start" | "replace" | "fresh", expiresMs: number): BuiltMail {
  const { text, html } = shell({
    origin, warning: AI_WARNING,
    title: why === "replace" ? "Your NEW personal AI work link" : why === "fresh" ? "Your fresh personal AI work link" : "Your personal AI work link",
    intro: why === "replace" ? "You replaced your AI work link. Every older link stopped working at once. A new one is below." : "Let a free AI assistant do the work for you. Everything it needs is behind the link in the box below.",
    expiry: `THIS LINK WORKS FOR 24 HOURS ONLY (until ${istStamp(expiresMs)}). After that it stops. ${FRESH}`,
    button: { label: "Show my AI work link", url: `${origin}/ai-link.html`, note: "The button works only for you: it asks you to sign in as the organizer (with your e-mailed 6-digit code). It always gives you a fresh link, so you can use it again after these 24 hours." },
    pasteLabel: "COPY EVERYTHING IN THIS BOX",
    paste: aiPaste(origin, key),
    steps: [
      "Copy everything in the box above.",
      "Paste it into any AI chat: ChatGPT, Claude, Gemini, Grok, DeepSeek, z.ai or any other.",
      "Answer its questions, one at a time, in your own words. It does all the work for you.",
    ],
    can: AI_CAN, stays: AI_STAYS,
    replace: "Open your console and press \"Replace my AI link\" (sign in with your e-mailed 6-digit code if asked). Every AI link stops working at once. To get a new 24-hour link by e-mail, press \"Get a fresh AI link\"; the button above always shows your current link after you sign in.",
    footer: "We never put this link in any other e-mail (publish, payment, reminders, invoices, reports), and it is not in any report or guest page. If you ever see it somewhere else, replace it.",
  });
  return { subject: AI_SUBJECT, text, html };
}

/** A co-host's link, e-mailed to the organizer who made it. Role: watch and announce only. `owner` names whose engagements it belongs to. */
export function coHostLinkMail(origin: string, key: string, owner: string, expiresMs: number): BuiltMail {
  const { text, html } = shell({
    origin, warning: HOST_WARNING,
    title: "A co-host AI work link",
    intro: `This link belongs to the Corporate Tambola engagements of ${owner}. It is for a co-host: a watch and announce role only. Hand it over by pasting the box to the person you chose, not by forwarding this e-mail.`,
    expiry: `THIS CO-HOST LINK WORKS FOR 24 HOURS ONLY (until ${istStamp(expiresMs)}). For a lasting co-host link, use the one your console showed when you made the co-host.`,
    button: { label: "Open my console", url: `${origin}/zc.html`, note: "Your console (after you sign in) shows the lasting co-host link made for you and lets you retire co-host keys." },
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

/** A plain alert, no link and no key in it: an AI link was used from somewhere new. */
export function newUseAlertMail(info: { when: string; country: string; program: string; kind: "AI" | "co-host"; origin?: string }): BuiltMail {
  const text = [
    `Someone new used your ${info.kind} work link`, "",
    `When: ${info.when}`, `Country: ${info.country || "unknown"}`, `Program: ${info.program || "unknown"}`, "",
    "This is normal if you just opened your link in a different AI chat or from another network.",
    "If this was not you, open your Corporate Tambola console and press \"Replace my AI link\": every AI link stops working at once.", "",
    "We send at most one of these a day for each link. This e-mail contains no link and no key.", "", footerText(info.origin), "",
  ].join("\n");
  const html = pageHtml("Someone new used your " + info.kind + " work link", `<tr><td style="padding:20px 22px 8px;"><h1 style="font-size:22px;color:#0B3D91;margin:0 0 8px;">Someone new used your ${esc(info.kind)} work link</h1><p style="font-size:15px;line-height:1.5;margin:0 0 12px;">When: ${esc(info.when)}<br>Country: ${esc(info.country || "unknown")}<br>Program: ${esc(info.program || "unknown")}</p><p style="font-size:14px;line-height:1.5;margin:0 0 12px;">This is normal if you just opened your link in a different AI chat or from another network. If this was not you, open your console and press <b>Replace my AI link</b>: every AI link stops working at once.</p><p style="font-size:12px;color:#666;margin:0;">At most one of these a day for each link. This e-mail contains no link and no key.</p></td></tr>`, info.origin);
  return { subject: `Someone new used your ${info.kind} work link`, text, html };
}

export const SIGNIN_SUBJECT = "Sign in to Corporate Tambola - choose how you want to continue";
/** The sign-in e-mail for an existing account: three ways in. It carries NO AI key or paste: the two buttons are single-use sign-in links (10 minutes) that lead to the signed-in pages, and the 6-digit code is the fallback. */
export function signInMail(origin: string, code: string, token: string): BuiltMail {
  const aiUrl = `${origin}/signin.html?t=${token}&go=ai`, consoleUrl = `${origin}/signin.html?t=${token}&go=console`;
  const intro = "Someone, hopefully you, asked to sign in to Corporate Tambola with this email address. Choose any ONE of the three ways below.";
  const o1 = "Copy the prompt into ChatGPT, Claude, Gemini, Grok, DeepSeek, z.ai or any AI chat. It asks you simple questions and sets everything up; payment and publishing stay with you.";
  const foot = "If you did not ask to sign in, ignore this email; nobody can sign in without it. Do not forward it: the buttons and the code give access to your account.";
  const text = [
    "YOU ARE ALMOST IN", "", intro, "",
    "OPTION 1 - LET YOUR AI DO THE WORK", o1, `Sign in and get my AI work link: ${aiUrl}`, "",
    "OPTION 2 - WORK ON YOUR OWN", `Open my console: ${consoleUrl}`, "",
    "OPTION 3 - ALREADY HAVE THE SIGN-IN PAGE OPEN?", `Type this 6-digit code there: ${code}`, "It works for 10 minutes.", "",
    "The two buttons work once, for 10 minutes.", "", foot, "", footerText(origin), "",
  ].join("\n");
  const card = (n: string, title: string, body: string) => `<tr><td style="padding:12px 22px 0;"><div style="border:1px solid #E6D9B8;border-radius:10px;background:#FBF6EC;padding:14px 16px;"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8A5A00;">OPTION ${n}</div><div style="font-size:18px;font-weight:700;color:#0B3D91;margin:3px 0 6px;">${esc(title)}</div>${body}</div></td></tr>`;
  const btn = (label: string, url: string) => `<a href="${esc(url)}" style="display:inline-block;background:#E0B872;color:#0B3D91;font-weight:700;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:8px;">${esc(label)}</a>`;
  const html = pageHtml("Sign in to "+BRAND.name, `<tr><td style="padding:20px 22px 4px;"><h1 style="margin:0;font-size:26px;line-height:1.25;color:#0B3D91;">You are almost in</h1><p style="margin:10px 0 0;font-size:15px;line-height:1.5;">${esc(intro)}</p></td></tr>
${card("1", "Let your AI do the work", `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${esc(o1)}</p>${btn("Sign in and get my AI work link", aiUrl)}`)}
${card("2", "Work on your own", `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">Sign in and open your console to build your engagement yourself.</p>${btn("Open my console", consoleUrl)}`)}
${card("3", "Already have the sign-in page open?", `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;">Type this 6-digit code there:</p><div style="font-family:Consolas,'Courier New',monospace;font-size:30px;letter-spacing:.3em;font-weight:700;color:#0B3D91;background:#fff;border:2px dashed #E0B872;border-radius:8px;padding:8px 14px;display:inline-block;">${esc(code)}</div><p style="margin:8px 0 0;font-size:13px;color:#555;">It works for 10 minutes.</p>`)}
<tr><td style="padding:14px 22px 4px;font-size:12px;color:#666;line-height:1.5;">The two buttons work once, for 10 minutes. ${esc(foot)}</td></tr>
<tr><td style="padding:6px 22px 20px;"><div style="background:#fdecea;border:1px solid #c0392b;border-radius:8px;padding:10px 12px;color:#b71c1c;font-weight:700;font-size:13px;text-align:center;">Do not forward this e-mail: the buttons and the code give access to your account.</div></td></tr>`, origin);
  return { subject: SIGNIN_SUBJECT, text, html };
}
