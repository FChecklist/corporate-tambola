// RELEASE 1.6.6: the Housie landing page refresh (index.html + landing.css only). The layout itself is checked in real Chrome at 320 / 360 / 1280 by tools/sim2/landing-shots.mjs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const PUB = new URL("../public/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, PUB), "utf8");
const html = read("index.html");
const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<[^>]+>/g, " ");

describe("the Housie landing page", () => {
  test("the hero: the owner's question, a plain sub line, one primary button to the free game, a second to the video", () => {
    expect(visible.replace(/\s+/g, " ")).toContain("This week, which teams will you engage with a close group online Housie?");
    expect(html).toContain("Close group online engagement of employees and associates.");
    expect(html).toMatch(/<a class="btn lp-main" href="\/zc\?demo=1">Try a free game with 10 people<\/a>/);
    expect(html).toContain('href="/demo.html">Watch the video');
  });
  test("a row of the six games on the phone and a panel on the laptop, both with All games to the home site; each game keeps its own address", () => {
    for (const cls of ["lp-choose", "lp-six"]) {
      const block = html.slice(html.indexOf(`class="${cls === "lp-choose" ? "choose lp-choose" : "six lp-six"}"`));
      const part = block.slice(0, block.indexOf("</ul>"));
      for (const u of ["https://housie.corporatetambola.com/", "https://bingo.corporatetambola.com/", "https://tictactoe.corporatetambola.com/", "https://snakes.corporatetambola.com/", "https://luck.corporatetambola.com/", "https://home.corporatetambola.com/contact"]) expect(part).toContain(`href="${u}"`);
      for (const nm of ["Tambola", "Bingo", "Tic Tac Toe", "Snakes and Ladders", "Luck by Chance", "Lucky Draw"]) expect(part).toContain(`<span class="gn"><i>Corporate</i>${nm}</span>`); // the small CORPORATE line above every game name
    }
    expect((html.match(/class="lp-allgames" href="https:\/\/home\.corporatetambola\.com\/">All games/g) ?? []).length).toBe(2); // phone chips and laptop panel
    {
    }
    const css = read("landing.css");
    const wide = css.slice(css.indexOf("@media (min-width:900px){")); expect(wide).toContain(".lp-six{display:block}"); expect(wide).toContain(".lp-choose{display:none}"); expect(css).toContain(".lp-six{display:none;"); // two different layouts, switched at 900px
  });
  test("the label above the headline is the owner's; no 'event managers'; no link to the console host that does not exist yet", () => {
    expect(html).toContain('<div class="eyebrow">For HR teams and managers</div>'); expect(/event manager/i.test(html)).toBe(false); expect(html).not.toContain("console.corporatetambola.com");
  });
  test("the heading of the games is the owner's; the trust list is the owner's list of eight; contact (phone and e-mail) is in the hero", () => {
    expect(html).toContain("Choose a game for your close group:"); expect(html).toContain('<p class="six-title">Choose a game for your close group</p>'); expect(html).not.toContain("Choose your game");
    for (const f of ["Designed for the engagement of company employees and their extended families.", "Close group online engagement and fun.", "Players never pay.", "Only the people you invite can join.", "No app to install.", "Player details are erased within 24 hours.", "A free Tambola or Bingo demo for 10 people.", "Designed to follow the EU GDPR, US privacy laws and India&rsquo;s DPDP Act."]) expect(html).toContain("<li><b>" + f + "</b></li>");
    expect((html.match(/<ul class="lp-facts">([\s\S]*?)<\/ul>/)![1]!.match(/<li>/g) ?? []).length).toBe(8);
    expect(html).toContain('href="tel:+919650397480">(+91) 96503 97480'); expect(html).toContain('href="mailto:hello@corporatetambola.com">hello@corporatetambola.com');
  });
  test("How a game day feels: three moments with the corrected drawings (modern men and women, no beards, head-coverings or headbands), the free-game button and a link to How it works", () => {
    const day = html.slice(html.indexOf('id="game-day"'), html.indexOf('class="lp-show"'));
    expect((day.match(/<li><svg class="lp-art"/g) ?? []).length).toBe(3); expect(day).toContain("You share one link"); expect(day).toContain("Everyone plays together"); expect(day).toContain("Winners are cheered");
    expect(day).toContain('href="/zc?demo=1">Try a free game with 10 people'); expect(day).toContain('href="#how">More about how it works');
    expect(/beard|turban|headband|bindi|hijab|cap-|kurta/i.test(day)).toBe(false);
  });
  test("no 'Live now', 'Coming soon' or 'private' anywhere the visitor reads", () => {
    expect(/live now|coming soon|private/i.test(visible)).toBe(false);
    expect(html).not.toContain("/img/ticket.webp"); // the old product picture showed 'Live now' and 'Private group' inside the image
  });
  test("the cache rule: css and js are linked with ?v=N, the landing css is in the Pages build, and the offline app cache is a new version", () => {
    for (const f of ["app.css", "site.css", "landing.css", "site.js", "theme.js"]) expect(html).toContain("/" + f + "?v=");
    expect(readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8")).toContain('"landing.css"');
    const sw = read("sw.js"); expect(sw).toContain('const CACHE = "tb-app-v3"');
  });
  test("the page keeps the controls site.js needs (pack list, buy button, price card)", () => {
    for (const id of ['id="pack"', 'id="payBtn"', 'id="packs"', 'id="priceNote"', 'id="whoL"']) expect(html).toContain(id);
  });
});
