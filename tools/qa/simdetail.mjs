import { openSim } from "./simlib.mjs";
const { b, p, app, tapEl, logs } = await openSim(process.argv[2]);
await tapEl(await app().$('.tab[data-tab="read"]'));
await tapEl(await app().$("#passageList .list-btn"));
console.log(await app().evaluate(() => [...document.querySelectorAll("#passageCard button")].map(e => { const r = e.getBoundingClientRect(); return e.textContent + "@" + Math.round(r.top) + "/" + Math.round(r.height) + (e.disabled ? "(disabled)" : "") + " vis=" + !!e.offsetParent; }).join("\n")));
const card = await app().$("#passageCard"); 
const order = ["[data-rate='0.25']", "[data-rate='0.5']", "#btnPassageSpeak", "#btnPassageSpeak", "#btnPassageSpeak", "#btnPassageStop", "[data-react='like']", "[data-react='fav']"];
for (const s of order) { const h = await app().$("#passageCard " + s); if (!h) { console.log(s, "MISSING"); continue; }
  const before = await app().evaluate(() => document.getElementById("passageCard").innerText.replace(/\s+/g," ").slice(-160));
  const got = await tapEl(h); await new Promise(r => setTimeout(r, 1200));
  const after = await app().evaluate(() => { const t = document.getElementById("toast"); return [document.getElementById("passageCard").innerText.replace(/\s+/g," ").slice(-160), t.className.indexOf("is-show")>=0 ? t.textContent : "", (document.getElementById("btnPassageSpeak")||{}).textContent, document.querySelector(".sent.is-playing") ? "HL" : "noHL"]; });
  console.log(s, got ? "event" : "NO-EVENT", "| speakBtn=" + after[2], after[3], "| toast=" + after[1].slice(0, 30), "| changed=" + (before !== after[0]));
}
await p.screenshot({ path: "/tmp/simdetail.png" });
await b.close();
