import { chromium } from "playwright";
import fs from "node:fs"; import http from "node:http"; import path from "node:path";
const EXEC = "/Users/ariel/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const ROOT = "/Users/ariel/tmp/iosp-mock";
const OUT = process.argv[2] || "/Users/ariel/tmp/iosp-shots";
fs.mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ttf": "font/ttf", ".json": "application/json" };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  let f = u.startsWith("/shots/") ? path.join(OUT, u.slice(7)) : path.join(ROOT, u);
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(d); });
});
await new Promise((r) => srv.listen(8791, "127.0.0.1", r));

const STATIONS = [["start", "Start here"], ["bluesky", "Bluesky"], ["sifa", "Sifa"], ["matadisco", "Matadisco"], ["sensors", "Sensors"], ["institutions", "Institutions"]];
const WIDTHS = { desktop: 1440, mobile: 390 };
const b = await chromium.launch({ executablePath: EXEC });
const report = [];

for (const [label, w] of Object.entries(WIDTHS)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const [station] of STATIONS) {
    await p.goto(`http://127.0.0.1:8791/index.html?station=${station}`, { waitUntil: "load" });
    await p.addStyleTag({ path: `${ROOT}/mock.css` });
    await p.waitForFunction(() => window.__ready === true, { timeout: 20000 });
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => {
      const ideas = document.querySelector(".station-panel:not([hidden]) .ideas");
      return {
        doc: document.documentElement.scrollHeight,
        broken: [...ideas.querySelectorAll("img")].filter((i) => !i.naturalWidth).length,
        scrollW: document.documentElement.scrollWidth,
        rootWidth: document.documentElement.clientWidth,
      };
    });
    const f = `${OUT}/${station}-${label}.png`;
    await p.screenshot({ path: f, fullPage: true });
    const over = m.scrollW > m.rootWidth + 2;
    report.push({ station, label, file: f, ...m, over });
    console.log(label.padEnd(8), station.padEnd(13), "doc-h", String(m.doc).padStart(5), "scrollW", m.scrollW, over ? "OVERFLOW" : "ok", m.broken ? "BROKEN-IMG " + m.broken : "");
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log("\nframes →", OUT);
