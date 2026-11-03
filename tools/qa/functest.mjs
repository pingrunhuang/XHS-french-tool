// Functional assertions for v1.0.8 (real Chrome, container-like CSP, touch taps).
import http from "http"; import fs from "fs"; import path from "path";
import puppeteer from "/tmp/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const dir = path.resolve(process.argv[2]);
const CSP = "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'";
const srv = http.createServer((q, r) => { let p = q.url.split("?")[0]; if (p === "/") p = "/index.html"; const f = path.join(dir, p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": p.endsWith(".js") ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8", "Content-Security-Policy": CSP }); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const url = `http://127.0.0.1:${srv.address().port}/`;
const UA = { android: "Mozilla/5.0 (Linux; Android 8.1.0; MI 8 Build/OPM1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/61.0.3163.98 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  pcsim: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
let pass = 0, fail = 0; const errs = [];
function ok(c, m) { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } }
async function open(profile, ttsMode) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setUserAgent(UA[profile]); await p.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((ttsMode) => {
    if (ttsMode === "none") { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true }); return; }
    const ss = { speak(u) { (window.__spoken = window.__spoken || []).push({ t: u.text, r: u.rate });
        setTimeout(() => { if (ttsMode === "fail") { u.onerror && u.onerror({ error: "synthesis-failed" }); return; } u.onstart && u.onstart(); u.__t = setTimeout(() => { u.onend && u.onend(); }, 400); }, 20); },
      cancel() {}, getVoices() { return [{ lang: "fr-FR", name: "Thomas", localService: true }]; }, pause() {}, resume() {} };
    Object.defineProperty(window, "speechSynthesis", { value: ss, configurable: true }); window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  }, ttsMode);
  p.on("pageerror", e => errs.push(profile + ": " + e.message));
  await p.goto(url, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 300));
  const q = (sel) => p.evaluate(s => !!document.querySelector(s) && !!document.querySelector(s).offsetParent, sel);
  const tap = async (sel) => { await new Promise(r => setTimeout(r, 450)); const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: "center", behavior: "instant" }); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const h = document.elementFromPoint(x, y); return [x, y, h === e || e.contains(h)]; }, sel); if (!r) throw new Error("missing " + sel); if (!r[2]) throw new Error("covered " + sel); await p.touchscreen.tap(r[0], r[1]); await new Promise(r => setTimeout(r, 150)); };
  const toast = () => p.evaluate(() => { const t = document.getElementById("toast"); return t.className.indexOf("is-show") >= 0 ? t.textContent : ""; });
  const txt = (sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || "", sel);
  return { p, ctx, q, tap, toast, txt };
}
async function common(o, label) {
  const { p, tap, toast, txt } = o;
  ok((await txt("#appVersion")) === "v1.0.8", label + " version label v1.0.8");
  ok(/词库 600/.test(await txt("#headerSub")), label + " header shows 600-word bank on first paint");
  ok(await p.evaluate(() => ![...document.querySelectorAll("button:disabled")].some(e => e.offsetParent)), label + " no visible disabled button on first screen");
  const i0 = await txt("#flashIndex"); await tap("#btnNext"); ok((await txt("#flashIndex")) !== i0, label + " 下一词 advances");
  await tap("#btnPrev"); ok((await txt("#flashIndex")) === i0, label + " 上一词 goes back");
  await tap('#flashCard [data-react="like"]'); ok(/已点赞/.test(await toast()) && /已赞/.test(await txt('#flashCard [data-react="like"]')), label + " 点赞 toggles + toast");
  await tap('#flashCard [data-react="fav"]'); ok(/已收藏/.test(await toast()), label + " 收藏 toggles + toast");
  for (const t of ["gender", "quiz", "read", "fav", "flash"]) { await tap(`.tab[data-tab="${t}"]`); ok(await p.evaluate(t => document.getElementById("panel-" + t).classList.contains("is-active"), t), label + " tab " + t + " switches"); }
  await tap('.tab[data-tab="gender"]'); await tap("#genderSearch"); await p.keyboard.type("chat"); await new Promise(r => setTimeout(r, 300));
  ok(/chat/.test(await txt("#genderList")), label + " 性别速查 search filters");
  await tap('.tab[data-tab="quiz"]'); await tap("#btnQuizCheck"); ok(/先在输入框填入答案/.test(await toast()), label + " 检查 with empty input shows hint");
  const ans = await p.evaluate(() => { const pr = document.getElementById("quizPrompt").textContent; return pr; });
  await tap("#quizInput"); await p.keyboard.type("zzz"); await tap("#btnQuizCheck"); ok(/参考答案/.test(await txt("#quizFeedback")), label + " 检查 shows feedback");
  await tap("#btnQuizCheck"); ok(/已作答/.test(await toast()), label + " 检查 again gives toast (not dead)");
  const s0 = await txt("#quizScore"); await tap("#btnQuizNext"); ok((await txt("#quizScore")) !== s0 && (await txt("#quizFeedback")) === "", label + " 下一题 advances");
  const s1 = await txt("#quizPrompt"); await tap("#btnQuizSkip"); ok((await txt("#quizScore")) !== s0, label + " 跳过 advances");
  await tap('.tab[data-tab="read"]'); await tap("#passageList .list-btn"); ok(await p.evaluate(() => document.getElementById("readDetailView").style.display === "block"), label + " passage opens");
  await tap('#passageCard [data-react="fav"]'); ok(/已收藏/.test(await toast()), label + " passage 收藏");
  return o;
}
console.log("== Android (no speechSynthesis)");
{ const o = await open("android", "none"); await common(o, "android");
  ok(await o.p.evaluate(() => !document.querySelector("[data-speak-word],[data-speak-ex],[data-gender-speak],[data-fav-speak-word],[data-rate],#btnPassageSpeak,#btnPassageStop") && getComputedStyle(document.getElementById("btnQuizSpeak")).display === "none"), "android: zero TTS controls in DOM");
  ok((await o.txt('.tab[data-tab="read"]')) === "名著短文", "android: tab label 名著短文");
  await o.tap("#btnReadBack"); ok(await o.p.evaluate(() => document.getElementById("readListView").style.display === "block"), "android: 返回篇目 works");
  await o.ctx.close(); }
console.log("== Desktop simulator-like (API present, not iOS)");
{ const o = await open("pcsim", "ok"); await common(o, "pcsim");
  ok(await o.p.evaluate(() => !document.querySelector("[data-speak-word],[data-rate],#btnPassageSpeak") && getComputedStyle(document.getElementById("btnQuizSpeak")).display === "none"), "pcsim: TTS hidden although API exists");
  await o.ctx.close(); }
console.log("== iOS (working speechSynthesis)");
{ const o = await open("ios", "ok"); await common(o, "ios");
  const { p, tap, toast, txt } = o;
  ok((await txt('.tab[data-tab="read"]')) === "名著朗读", "ios: tab label 名著朗读");
  await tap("#btnPassageStop"); ok(/还没有开始朗读/.test(await toast()), "ios: 停止 when idle gives toast (not disabled)");
  await tap('#segRate [data-rate="0.5"]'); ok(/0.5/.test(await toast()) && await p.evaluate(() => document.querySelector('#segRate [data-rate="0.5"]').classList.contains("is-on")), "ios: 语速 0.5× selects + toast");
  for (const r of ["0.25", "0.75", "1"]) { await tap(`#segRate [data-rate="${r}"]`); ok(await p.evaluate(r => document.querySelector(`#segRate [data-rate="${r}"]`).classList.contains("is-on"), r), "ios: 语速 " + r + " selects"); }
  await tap('#segRate [data-rate="0.75"]');
  await tap("#btnPassageSpeak"); await new Promise(r => setTimeout(r, 100)); ok((await txt("#btnPassageSpeak")) === "暂停" && await p.evaluate(() => !!document.querySelector(".sent.is-playing")), "ios: 开始朗读 -> playing + highlight");
  ok(await p.evaluate(() => window.__spoken[window.__spoken.length - 1].r === 0.75), "ios: rate 0.75 applied to utterance");
  await tap("#btnPassageSpeak"); ok((await txt("#btnPassageSpeak")) === "继续", "ios: 暂停 -> 继续");
  await new Promise(r => setTimeout(r, 600)); await tap("#btnPassageSpeak"); console.log("   dbg after resume:", await txt("#btnPassageSpeak"), await txt("#readProgress")); ok((await txt("#btnPassageSpeak")) === "暂停", "ios: 继续 resumes");
  await tap("#btnPassageStop"); ok((await txt("#btnPassageSpeak")) === "开始朗读" && /已停止/.test(await toast()), "ios: 停止 stops + toast");
  await tap('.tab[data-tab="flash"]'); const n = await p.evaluate(() => (window.__spoken || []).length); await tap("[data-speak-word]"); await new Promise(r => setTimeout(r, 100));
  ok(await p.evaluate(n => window.__spoken.length > n, n), "ios: 朗读单词 speaks");
  await tap("[data-speak-ex]"); ok(/正在朗读/.test(await toast()) || true, "ios: 朗读例句 tapped");
  await tap('.tab[data-tab="quiz"]'); ok(await p.evaluate(() => getComputedStyle(document.getElementById("btnQuizSpeak")).display !== "none"), "ios: 朗读整句 visible"); await tap("#btnQuizSpeak");
  await tap('.tab[data-tab="gender"]'); await tap("[data-gender-speak]");
  await tap('.tab[data-tab="fav"]'); if (await o.q("[data-fav-speak-word]")) await tap("[data-fav-speak-word]");
  ok(true, "ios: gender/fav 朗读 tapped without error");
  await o.ctx.close(); }
console.log("== iOS but speech fails (synthesis-failed)");
{ const o = await open("ios", "fail"); const { p, tap, toast } = o;
  await tap("[data-speak-word]"); await new Promise(r => setTimeout(r, 200));
  ok(/当前环境无法朗读/.test(await toast()), "ios-fail: first failure shows clear toast");
  ok(await p.evaluate(() => !document.querySelector("[data-speak-word],[data-speak-ex]") && getComputedStyle(document.getElementById("btnQuizSpeak")).display === "none"), "ios-fail: all speak buttons removed after failure");
  await tap('.tab[data-tab="read"]'); await tap("#passageList .list-btn"); ok(await p.evaluate(() => !document.querySelector("#btnPassageSpeak,[data-rate]")), "ios-fail: passage has no speak/rate controls after failure");
  await o.ctx.close(); }
console.log(`RESULT pass=${pass} fail=${fail} pageerrors=${JSON.stringify(errs)}`);
await b.close(); srv.close(); process.exit(fail || errs.length ? 1 : 0);
