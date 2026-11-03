import puppeteer from "/tmp/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
export async function openSim(url) {
  const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  const logs = []; p.on("console", m => logs.push(m.type() + " " + m.text().slice(0, 300)));
  await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 }); await new Promise(r => setTimeout(r, 9000));
  const app = () => p.frames().find(f => /\/app\/.*index\.html/.test(f.url()));
  await app().evaluate(() => { window.__last = null; document.addEventListener("pointerdown", e => { window.__last = [e.clientX, e.clientY, e.isTrusted]; }, true); });
  // calibrate: page coords -> app client coords
  async function probe(x, y) { await app().evaluate(() => { window.__last = null; }); await p.mouse.click(x, y); await new Promise(r => setTimeout(r, 300)); return app().evaluate(() => window.__last); }
  const a = await probe(650, 400), c = await probe(750, 600);
  if (!a || !c) throw new Error("calibration failed " + JSON.stringify([a, c]));
  const sx = (c[0] - a[0]) / 100, sy = (c[1] - a[1]) / 200;
  const toPage = (cx, cy) => [650 + (cx - a[0]) / sx, 400 + (cy - a[1]) / sy];
  async function tapEl(handle) {
    await handle.evaluate(e => e.scrollIntoView({ block: "center" })); await new Promise(r => setTimeout(r, 200));
    const r = await handle.evaluate(e => { const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    const [x, y] = toPage(r[0], r[1]); await p.mouse.click(x, y); await new Promise(r => setTimeout(r, 500));
    const got = await app().evaluate(() => window.__last); return got;
  }
  return { b, p, app, tapEl, logs, calib: { a, c, sx, sy } };
}
