// Render the preview in headless Chrome over CDP and capture sections at a given width.
// node shoot.mjs <url> <width> <mobile:0|1> <out-prefix> <firstSelector> [lastSelector]
// Prints page-overflow and font/image load status as JSON. No dependencies (Node 22+ WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, width, mobile, out, first, last = first] = process.argv.slice(2);
const W = Number(width), M = mobile === '1';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'csu-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result; if (r?.exceptionDetails) { console.error('page error:', r.exceptionDetails.exception?.description || r.exceptionDetails.text); process.exit(1); } return r?.result?.value; };

await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errs=[];addEventListener("error",e=>__errs.push(e.message))' });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: M ? 844 : 1000, deviceScaleFactor: 2, mobile: M });
if (M) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url });
for (let i = 0; i < 60 && (await evaluate('document.readyState')) !== 'complete'; i++) await sleep(250);
await sleep(500);
const errors = await evaluate('window.__errs || []');
await evaluate('document.fonts.ready.then(() => true)');
await sleep(400);
const info = await evaluate(`(() => {
  const a = document.querySelector(${JSON.stringify(first)}), b = document.querySelector(${JSON.stringify(last)});
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  return { top: ra.top + scrollY, bottom: rb.bottom + scrollY,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    fonts: [...document.fonts].map(f => f.family + ':' + f.status).filter((v, i, x) => x.indexOf(v) === i),
    brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
    coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints };
})()`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: info.top, width: W, height: info.bottom - info.top, scale: 1 } });
writeFileSync(`${out}.png`, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ width: W, mobile: M, errors, ...info, file: `${out}.png` }));
ws.close(); chrome.kill();
