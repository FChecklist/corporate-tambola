// The first two steps of the organizer console, made idiot-proof (owner order, 26 Oct 2026): a refusal says which choice is wrong and what to do, right above the Save button;
// the red message goes as soon as the person changes anything; choices that are not saved yet are marked; the number typed is the number saved.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { newWorld, openPage, roundAt, T, type Page } from './harness';
import { PRIZE_HOUSES } from '../../../packages/beacon/src/config';

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200; // one hour after T (T is 3.30 pm India time on 1 Oct 2026)
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api('POST', '/api/start', { email: 'boss@acme.com' }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api('POST', '/api/z', { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api('POST', `/api/z/${id}/publish`, { email: 'boss@acme.com', phone: '98765 43210' }, o.token);
const summary = async (o: O, id: string) => o.json(await o.api('GET', `/api/z/${id}/summary`, undefined, o.aiKey));
/** records every settings save the page sends */
function spy() {
  const patches: any[] = [];
  const hook = (win: any, f: string) => {
    if (f !== 'control.js') return;
    const real = win.fetch;
    win.fetch = async (input: any, init?: any) => {
      const u = new URL(String(input), 'http://localhost');
      if (u.pathname.endsWith('/settings') && String(init?.method || 'GET').toUpperCase() === 'PATCH') patches.push(JSON.parse(init.body));
      return real(input, init);
    };
  };
  return { patches, hook };
}
async function consolePage(o: O, eid: string, extra: { guide?: boolean; hook?: (win: any, f: string) => void } = {}) {
  const p = await openPage(o.world, {
    url: `http://localhost/zc?e=${eid}`, html: 'zc.html', scripts: [...(extra.guide ? ['guide.js'] : []), 'zgame.js', 'control.js', 'zc.js'],
    session: { 'ctz-org': o.token, 'ctz-aimsg': o.aiMessage, 'ctz-email': 'boss@acme.com' },
    afterLoad: (win: any, f: string) => { if (f === 'zgame.js' && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; extra.hook?.(win, f); },
  });
  open.push(p); return p;
}
const ck = (path: string, v: string) => `[data-ck='${path}'][data-v='${v}']`;
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open='${n}']`);
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event('input', { bubbles: true })); };
/** waits until the page is not in the middle of a Save */
const idle = (p: Page) => p.waitFor(() => !(p.win as any).__zc.saving);

describe('console steps 1 and 2: told what is wrong, and how to put it right', () => {
  test('a time that has already passed today says so and names the way out; passed times are marked; the red message goes when a time is tapped', async () => {
    const o = await organizer(); await make(o, 'IP-PAST');
    const p = await consolePage(o, 'IP-PAST'); await p.waitFor((x) => /Hello/.test(x));
    expect(p.$(`[data-ck='day'][aria-pressed='true']`)!.textContent).toContain('Today'); // the game starts one hour after the test clock, so Today is chosen
    p.click(ck('time', '10:00'));
    expect(p.$(ck('time', '10:00'))!.textContent).toContain('(passed)'); expect(p.$(ck('time', '20:00'))!.textContent).not.toContain('passed');
    p.click(`[data-save='1']`);
    await p.waitFor((x) => x.includes('That time has already passed today. Tap a later time, or tap Tomorrow.'));
    expect(p.$('#sec1 .zc-toast-foot')!.textContent).toContain('already passed today'); // right above the Save button
    expect(p.win.document.querySelectorAll('#sec1 .zc-toast').length).toBe(1); // and only once
    await idle(p);
    p.click(ck('time', '20:00')); // changing the choice removes the refusal
    expect(p.$('#sec1 .zc-toast-foot')).toBeNull();
    p.click(`[data-save='1']`); await idle(p);
    expect((await summary(o, 'IP-PAST')).startMs).toBe(Date.parse('2026-10-01T20:00:00+05:30'));
  });

  test('a missing day, or a missing time, says which one it is and how to fix it', async () => {
    const o = await organizer(); await make(o, 'IP-MISS');
    const p = await consolePage(o, 'IP-MISS'); await p.waitFor((x) => /Hello/.test(x));
    p.click(ck('day', 'other')); setField(p, '#f-dayo', ''); p.click(`[data-save='1']`);
    await p.waitFor((x) => x.includes('The day is still missing: tap Today, Tomorrow or another day'));
    await idle(p);
    p.click(ck('day', '2026-10-02')); p.click(ck('time', 'other')); setField(p, '#f-timeo', ''); p.click(`[data-save='1']`);
    await p.waitFor((x) => x.includes('The time is still missing: tap one of the times'));
    expect(p.text()).not.toContain('The day is still missing');
  });

  test('Take me there points at the row of choices when the typed box is not on the screen', async () => {
    const o = await organizer(); await make(o, 'IP-FOCUS');
    const p = await consolePage(o, 'IP-FOCUS', { guide: true }); await p.waitFor((x) => /Hello/.test(x));
    const CTG = p.win.CTG;
    p.click(ck('time', '18:00')); // a chip is chosen, so the typed time box is not drawn
    expect(p.$('#f-timeo')).toBeNull();
    expect(CTG.focus('#f-timeo')).toBe(true);
    expect(p.$(`[aria-labelledby='gl-time']`).classList.contains('ctg-flag')).toBe(true);
    openStep(p, 2);
    const cap = p.$('#f-cap'); expect(cap.closest('[hidden]')).toBeTruthy(); // the typed number is behind the My crowd is a different size button
    Object.defineProperty(cap, 'offsetParent', { value: null, configurable: true }); // what a real browser says about a hidden box
    expect(CTG.focus('#f-cap')).toBe(true);
    expect(p.$(`[aria-labelledby='gl-cap']`).classList.contains('ctg-flag')).toBe(true);
    expect(cap.classList.contains('ctg-flag')).toBe(false);
  });

  test('choices that are not saved yet are marked on the step and on the publish page, nothing is saved by moving away, and the marks go after Save', async () => {
    const o = await organizer(); await make(o, 'IP-UNSAVED');
    const p = await consolePage(o, 'IP-UNSAVED'); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 2);
    p.click(ck('tix', '2'));
    expect(p.$('#sec2 .zc-say')!.textContent).toBe('Not saved yet. Press Save and continue below.');
    openStep(p, 7);
    expect(p.$('#sec2 .zc-hint')!.textContent).toContain('Not saved yet'); // the closed step does not show the old saved line as if it were current
    expect(p.$('#unsaved2')!.textContent).toContain('Step 2 has changes you have not saved yet');
    expect((await summary(o, 'IP-UNSAVED')).tickets).toBe(1);
    openStep(p, 2); p.click(`[data-save='2']`); await idle(p);
    expect((await summary(o, 'IP-UNSAVED')).tickets).toBe(2);
    openStep(p, 2); expect(p.$('#sec2 .zc-say')!.textContent).toBe('Saved. You can change it any time.');
    openStep(p, 7); expect(p.$('#unsaved2')).toBeNull();
  });

  test('the number of players typed is the number saved, whichever way it crosses 10', async () => {
    const o = await organizer(); await make(o, 'IP-TYPED', { cap: 10 });
    const p = await consolePage(o, 'IP-TYPED'); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 2);
    setField(p, '#f-cap', '300'); p.click(`[data-save='2']`); await idle(p); // saved at once, without the page being redrawn in between
    expect(p.text()).not.toContain('A game at Rs 0 is for up to 10 people');
    expect((await o.json(await o.api('GET', '/api/z/IP-TYPED/info', undefined, o.aiKey))).cap).toBe(300);
    openStep(p, 2); setField(p, '#f-cap', '8'); p.click(`[data-save='2']`); await idle(p);
    expect(await summary(o, 'IP-TYPED')).toMatchObject({ limit: 8, demo: true }); // 10 or fewer is the Rs 0 game, as the page says
  });

  test('a paid game says how many people it was paid for and refuses more before anything is sent; a free game of 10 says where to get more', async () => {
    const o = await organizer(); await make(o, 'IP-PAID'); await publish(o, 'IP-PAID');
    o.world.raw.prepare(`UPDATE engagement SET pack=100 WHERE id='IP-PAID'`).run(); // paid for 100 people
    const pw = spy();
    const p = await consolePage(o, 'IP-PAID', { hook: pw.hook }); await p.waitFor((x) => x.includes('Your game at a glance')); openStep(p, 2);
    expect(p.text()).toContain('Your payment covers up to 100 people. For more people, make a new game like this one in step 7.');
    p.click(ck('cap', '250')); p.click(`[data-save='2']`);
    await p.waitFor((x) => x.includes('Your payment covers up to 100 people. Choose 100 or fewer'));
    expect(pw.patches.length).toBe(0); // nothing was sent
    await idle(p);
    p.click(ck('cap', '100')); p.click(`[data-save='2']`); await idle(p);
    expect(pw.patches.length).toBe(1); expect('demo' in pw.patches[0]).toBe(false); // a bought size is never turned into a free game by a tap
    await make(o, 'IP-FREE', { cap: 10, demo: true }); await publish(o, 'IP-FREE');
    const d = await consolePage(o, 'IP-FREE'); await d.waitFor((x) => x.includes('Your game at a glance')); openStep(d, 2);
    expect(d.text()).toContain('This game is free for up to 10 people. To invite more, choose a bigger size in step 8 and pay');
  });

  test('saving step 1 does not carry the unsaved who-calls-the-numbers choice of step 2, and does not lose it either', async () => {
    const o = await organizer(); await make(o, 'IP-LEAK'); const pw = spy();
    const p = await consolePage(o, 'IP-LEAK', { hook: pw.hook }); await p.waitFor((x) => /Hello/.test(x));
    const modeOnServer = async () => (await o.json(await o.api('GET', '/api/z/IP-LEAK/info', undefined, o.aiKey))).callMode;
    openStep(p, 2); p.click(ck('mode', 'host'));
    const base0 = (p.win as any).__zc.fBase;
    openStep(p, 1); p.click(`[data-save='1']`); await idle(p);
    await p.waitFor(() => (p.win as any).__zc.fBase !== base0, 10_000); // the refresh that follows the save has put the form in line with the server
    expect(pw.patches.length).toBe(1); expect('callMode' in pw.patches[0]).toBe(false);
    expect(await modeOnServer()).toBe('auto');
    openStep(p, 2);
    expect(p.$(ck('mode', 'host'))!.getAttribute('aria-pressed')).toBe('true'); // the tap is still there ...
    expect(p.$('#sec2 .zc-say')!.textContent).toBe('Not saved yet. Press Save and continue below.'); // ... and it still says it is not saved
    p.click(`[data-save='2']`); await idle(p);
    expect(await modeOnServer()).toBe('host'); // pressing Save keeps what was tapped
  });

  test('a tap that changes nothing is not "not saved yet" (the chosen chip again, "My crowd is a different size"), and a real change still is', async () => {
    const o = await organizer(); await make(o, 'IP-NOOP');
    const p = await consolePage(o, 'IP-NOOP'); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 2);
    const dirty = () => (p.win as any).__ctDirty();
    p.click(ck('tix', '1')); // 1 ticket is the chosen size already
    expect(!!p.$('#unsavednote')).toBe(false); expect(dirty()).toBe(false);
    p.click(`[data-bool='capOther']`); // only shows the box for an own number
    expect(!!p.$('#unsavednote')).toBe(false); expect(dirty()).toBe(false); expect(!!p.$('#f-cap')!.closest('[hidden]')).toBe(false);
    p.click(ck('tix', '2')); // a real change
    expect(p.$('#unsavednote')!.textContent).toMatch(/Not saved yet/); expect(dirty()).toBe(true);
  });

  test('ticking no kind of guest is explained before and after Save, and the red message goes as soon as a kind is ticked', async () => {
    const o = await organizer(); await make(o, 'IP-CATS');
    const p = await consolePage(o, 'IP-CATS'); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 2);
    p.click(ck('aud', '2')); // employees plus friends and family: guests may invite
    for (let i = 0; i < 10; i++) { const b = p.$(`[data-ck='cats'][aria-pressed='true']`); if (!b) break; b.click(); }
    expect(p.text()).toContain('Tick at least one kind of guest, or change');
    p.click(`[data-save='2']`);
    await p.waitFor((x) => x.includes('Pick at least one kind of guest.'));
    expect(p.$('#sec2 .zc-toast-foot')).toBeTruthy();
    expect(p.win.document.querySelectorAll('#sec2 .zc-toast').length).toBe(1); // one copy, right above the Save button
    await idle(p);
    p.click(ck('cats', 'friends'));
    expect(p.$('#sec2 .zc-toast-foot')).toBeNull(); expect(p.text()).not.toContain('Pick at least one kind of guest.'); expect(p.text()).not.toContain('Tick at least one kind of guest, or change');
  });
});
