// Real-Chrome click audit for the minitool under container-like CSP.
// usage: node clickall.mjs <distDir> <profile: android|ios|pc> [cpuThrottle]
import http from "http"; import fs from "fs"; import path from "path";
import puppeteer from "/tmp/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const dir = path.resolve(process.argv[2]); const profile = process.argv[3] || "android"; const cpu = Number(process.argv[4] || 1);
const CSP = "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'";
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json" };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Content-Security-Policy": CSP }); fs.createReadStream(f).pipe(r); });
await new Promise(res => srv.listen(0, "127.0.0.1", res)); const url = `http://127.0.0.1:${srv.address().port}/`;
const UA = { android: "Mozilla/5.0 (Linux; Android 8.1.0; MI 8 Build/OPM1.171019.026; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/61.0.3163.98 Mobile Safari/537.36 XHS/9.46",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 XHS/9.46",
  pc: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" }[profile];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const errors = [];
async function fresh() {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport(profile === "pc" ? { width: 375, height: 667 } : { width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  if (cpu > 1) { const c = await page.createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
  await page.evaluateOnNewDocument((profile) => {
    if (profile === "android") { try { delete window.speechSynthesis; } catch (e) {} Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true }); }
    else { const ss = { _q: [], speaking: false, speak(u) { this.speaking = true; window.__spoken = (window.__spoken || []).concat([{ t: u.text, r: u.rate }]); setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => { this.speaking = false; u.onend && u.onend(); }, 300); }, 20); }, cancel() { this.speaking = false; }, getVoices() { return [{ lang: "fr-FR", name: "Thomas" }]; }, pause() {}, resume() {} };
      Object.defineProperty(window, "speechSynthesis", { value: ss, configurable: true }); window.SpeechSynthesisUtterance = function (t) { this.text = t; }; }
    window.__mut = 0; new MutationObserver(m => { window.__mut += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener("securitypolicyviolation", e => { (window.__csp = window.__csp || []).push(e.violatedDirective + " " + e.blockedURI); });
  }, profile);
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const t0 = Date.now(); await page.goto(url, { waitUntil: "load" }); const loadMs = Date.now() - t0;
  await new Promise(r => setTimeout(r, 1500));
  return { page, loadMs };
}
// list visible clickable elements in the active area
const LIST = `(() => { const out = []; const els = document.querySelectorAll("button, input, [data-tab], .list-btn");
  els.forEach((el, i) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || cs.display === "none") return;
    // must be in viewport after scrollIntoView, we report raw
    out.push({ i, tag: el.tagName, id: el.id, text: (el.value || el.textContent || "").trim().slice(0, 24), disabled: !!el.disabled, cls: el.className }); });
  return out; })()`;
async function tapIdx(page, i) {
  return page.evaluate(async (i) => {
    const el = document.querySelectorAll("button, input, [data-tab], .list-btn")[i];
    if (!el) return { x: 0, y: 0, hit: "MISSING" };
    el.scrollIntoView({ block: "center" }); await new Promise(r => setTimeout(r, 50));
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y); const ok = hit && (hit === el || el.contains(hit));
    return { x, y, hit: ok ? "self" : (hit ? hit.tagName + "#" + hit.id + "." + hit.className : "null") };
  }, i);
}
async function setup(page, tab, detail) {
  if (tab) { await page.evaluate(t => { const b = document.querySelector('.tab[data-tab="' + t + '"]'); b.scrollIntoView(); }, tab); const r = await page.evaluate(t => { const b = document.querySelector('.tab[data-tab="' + t + '"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, tab); await page.touchscreen.tap(r[0], r[1]); await new Promise(r => setTimeout(r, 250)); }
  if (detail) { const r = await page.evaluate(() => { const b = document.querySelector("#passageList .list-btn"); if (!b) return null; b.scrollIntoView({ block: "center" }); const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }); if (r) { await page.touchscreen.tap(r[0], r[1]); await new Promise(r => setTimeout(r, 250)); } }
}
const scenarios = [["flash"], ["gender"], ["quiz"], ["read"], ["read", true], ["fav"]];
const rows = []; let firstLoad;
for (const [tab, detail] of scenarios) {
  const { page, loadMs } = await fresh(); firstLoad = firstLoad || loadMs; await setup(page, tab, detail);
  const items = await page.evaluate(LIST); await page.close();
  for (const it of items) {
    if (it.tag === "INPUT" && it.id === "genderSearch") { rows.push({ scen: tab + (detail ? "/detail" : ""), ...it, hit: "-", resp: "input(skip)" }); continue; }
    const { page: p } = await fresh(); await setup(p, tab, detail);
    const h = await tapIdx(p, it.i); const before = await p.evaluate(() => [window.__mut, document.getElementById("toast") && document.getElementById("toast").textContent, (window.__spoken || []).length]);
    if (it.tag === "INPUT") { await p.touchscreen.tap(h.x, h.y); await p.keyboard.type("x"); } else await p.touchscreen.tap(h.x, h.y);
    await new Promise(r => setTimeout(r, 500));
    const after = await p.evaluate(() => [window.__mut, document.getElementById("toast") && document.getElementById("toast").className + "|" + document.getElementById("toast").textContent, (window.__spoken || []).length, window.__csp || []]);
    const resp = (after[0] - before[0]) + " mut" + (after[2] > before[2] ? ", spoke" : "") + (after[1] && after[1].indexOf("is-show") >= 0 ? ", toast:" + after[1].split("|")[1].slice(0, 30) : "");
    rows.push({ scen: tab + (detail ? "/detail" : ""), ...it, hit: h.hit, resp, csp: after[3].join(";") });
    await p.close();
  }
}
console.log(JSON.stringify({ profile, cpu, firstLoadMs: firstLoad }));
for (const r of rows) console.log([r.scen, r.tag, r.id || "", JSON.stringify(r.text), r.disabled ? "DISABLED" : "", "hit=" + r.hit, r.resp, r.csp || ""].join(" | "));
console.log("errors:", JSON.stringify([...new Set(errors)]));
await browser.close(); srv.close();
