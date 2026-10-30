import { chromium, makeApi } from "/tmp/claude-0/work/rt/tools/livetest/campaign/lib.mjs";
import { createGame, newContext, joinPlayer, readClock, now } from "/tmp/claude-0/work/rt/tools/livetest/campaign/core.mjs";
import { RequestMeter } from "/tmp/claude-0/work/rt/tools/livetest/campaign/meter.mjs";
const base="http://localhost:8821"; await readClock(base);
const meter=new RequestMeter(base), api=makeApi(base,meter), b=await chromium.launch();
const g=await createGame(api,"dbg","UC-DBG",{startInSec:20,callSeconds:12,cap:10});
const p=await joinPlayer(b,base,meter,g.tag.id,"9123456789");
p.page.on("console",m=>{ if(!/BLOCKED/.test(m.text())) console.log("CONSOLE",m.type(),m.text().slice(0,200)) });
p.page.on("requestfinished",r=>{ if(/beacon/.test(r.url())) console.log("BEACON",r.url().slice(0,140)) });
p.page.on("response",r=>{ if(r.status()>=400) console.log("HTTP",r.status(),r.url().slice(0,120)); });
console.log('PROBE',JSON.stringify(await p.page.evaluate(()=>({patched:String(ZG.PhoneRuntime).includes('aa')||String(ZG.PhoneRuntime).slice(0,80),keys:Object.keys(window.__rt||{}).slice(0,40),view:Object.keys(window.__rt.view()),v:JSON.stringify(window.__rt.view()).slice(0,400)}))));
for(let i=0;i<2;i++){ await new Promise(r=>setTimeout(r,2000)); console.log(i, JSON.stringify(await p.page.evaluate(()=>{const v=window.__rt&&window.__rt.view&&window.__rt.view();return v?{phase:v.phase,log:v.log.length}:null}).catch(e=>String(e)))); }
await b.close();
