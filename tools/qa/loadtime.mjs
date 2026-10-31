import http from "http"; import fs from "fs"; import path from "path";
import puppeteer from "/tmp/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
for (const d of process.argv.slice(2)) {
  const dir = path.resolve(d);
  const srv = http.createServer((q, r) => { let u = q.url === "/" ? "/index.html" : q.url; const f = path.join(dir, u); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": u.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8" }); r.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(0, r));
  const res = [];
  for (let k = 0; k < 3; k++) {
    const p = await b.newPage(); const c = await p.createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
    const t = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null }; });
    res.push(t); await p.close();
  }
  console.log(d, JSON.stringify(res)); srv.close();
}
await b.close();
