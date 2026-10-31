import { openSim } from "./simlib.mjs";
const { b, p, app, tapEl, logs, calib } = await openSim(process.argv[2]); const tag = process.argv[3];
console.log("calib", JSON.stringify(calib));
const SEL = "button, input, .list-btn";
const sig = () => app().evaluate(() => { const t = document.getElementById("toast"); return document.querySelector(".app").innerText + "||" + (t.className.indexOf("is-show") >= 0 ? t.textContent : "") + "||" + [...document.querySelectorAll(".is-on,.is-active,.is-playing")].map(e => e.textContent).join(","); });
const toastNow = () => app().evaluate(() => { const t = document.getElementById("toast"); return t.className.indexOf("is-show") >= 0 ? t.textContent : ""; });
async function tab(n) { const h = await app().$(`.tab[data-tab="${n}"]`); await tapEl(h); return app().evaluate(n => document.getElementById("panel-" + n).classList.contains("is-active"), n); }
async function audit(label) {
  const n = (await app().$$(SEL)).length;
  for (let i = 0; i < n; i++) {
    const hs = await app().$$(SEL); const h = hs[i]; if (!h) continue;
    const info = await h.evaluate(e => { let vis = true, x = e; while (x && x.nodeType === 1) { const cs = getComputedStyle(x); if (cs.display === "none" || cs.visibility === "hidden") vis = false; x = x.parentNode; } return { vis, text: (e.textContent || e.placeholder || "").trim().slice(0, 16), id: e.id, tab: e.getAttribute("data-tab"), dis: e.disabled, tag: e.tagName, inPanel: !!e.closest(".panel.is-active") }; });
    if (!info.vis || info.tab || !info.inPanel && !info.id) continue;
    const hit = await h.evaluate(e => { e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === e || e.contains(t) ? "self" : (t ? t.tagName + "." + t.className : "null"); });
    await app().evaluate(() => { const t = document.getElementById("toast"); t.className = "toast"; t.textContent = ""; });
    const s0 = await sig(); const got = await tapEl(h);
    if (info.tag === "INPUT") { await p.keyboard.type("le"); await new Promise(r => setTimeout(r, 400)); }
    const s1 = await sig(); const ts = await toastNow();
    console.log([label, info.tag, info.id, JSON.stringify(info.text), info.dis ? "disabled" : "", "hit=" + hit, got ? "event@" + got.map(v => typeof v === "number" ? Math.round(v) : v).join(",") : "NO-EVENT", s0 !== s1 ? "UI changed" : "NO UI CHANGE", ts ? "toast=" + ts.slice(0, 26) : ""].join(" | "));
  }
}
for (const t of ["flash", "gender", "quiz", "read", "fav"]) {
  console.log("-- tab", t, "active:", await tab(t));
  if (t === "read") { const lb = await app().$("#passageList .list-btn"); await tapEl(lb); console.log("detail shown:", await app().evaluate(() => getComputedStyle(document.getElementById("readDetailView")).display)); await audit("read/detail"); await tab("read"); const bk = await app().$("#btnReadBack"); if (await bk.evaluate(e => !!e.offsetParent)) await tapEl(bk); }
  await audit(t);
}
await p.screenshot({ path: `/tmp/simclick2-${tag}.png` });
console.log("errors:", JSON.stringify(logs.filter(l => /^error|Refused|violat/i.test(l)).slice(0, 15)));
await b.close();
