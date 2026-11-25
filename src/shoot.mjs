// Render the preview in headless Chrome over CDP and capture sections at a given width.
// node shoot.mjs <url> <width> <mobile:0|1> <out-prefix> <firstSelector> [lastSelector]
// Prints page-overflow and font/image load status as JSON. No dependencies (Node 22+ WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, width, mobile, out, first, last = first] = process.argv.slice(2);
const section = JSON.parse(process.env.CS_SECTION_CAPTURE || 'null');
const W = Number(width), M = mobile === '1';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${section ? 0 : 9333}`, '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${section ? join(section.dir, 'chrome') : mkdtempSync(join(tmpdir(), 'csu-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target, ws;
try {
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { const port = section ? Number(readFileSync(join(section.dir, 'chrome', 'DevToolsActivePort'), 'utf8').split('\n')[0]) : 9333; target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result; if (r?.exceptionDetails) { console.error('page error:', r.exceptionDetails.exception?.description || r.exceptionDetails.text); throw new Error("Browser evaluation failed"); } return r?.result?.value; };

await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errs=[];addEventListener("error",e=>__errs.push(e.message))' });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: section?.height ?? (M ? 844 : 1000), deviceScaleFactor: 2, mobile: M });
if (section) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (M) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url });
for (let i = 0; i < 60 && (await evaluate('document.readyState')) !== 'complete'; i++) await sleep(250);
if (section) await evaluate(`(() => {
  const s = ${JSON.stringify(section)};
  if (typeof s.macbook === 'boolean') s.macbook ? document.documentElement.dataset.screen = 'macbook' : delete document.documentElement.dataset.screen;
  if (s.tab === 'portrait' || s.tab === 'landscape') {
    const feature = document.querySelector(${JSON.stringify(first)} + ' .phone-feature');
    if (feature) feature.dataset.orientation = s.tab;
  } else if (/^photo-[1-9][0-9]?$/.test(s.tab)) {
    document.querySelector(${JSON.stringify(first)} + " .photo-gallery")?.dispatchEvent(new CustomEvent("gallery-restore", {detail: Number(s.tab.slice(6))}));
  }
  return true;
})()`);
await sleep(500);
const errors = await evaluate('window.__errs || []');
await evaluate('document.fonts.ready.then(() => true)');
await sleep(400);
const info = await evaluate(`(() => {
  const a = document.querySelector(${JSON.stringify(first)}), b = document.querySelector(${JSON.stringify(last)});
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  return { left: ra.left + scrollX, width: ra.width, top: Math.min(ra.top, a.querySelector(":scope > .chapter-heading")?.getBoundingClientRect().top ?? ra.top) + scrollY, bottom: rb.bottom + scrollY,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    fonts: [...document.fonts].map(f => f.family + ':' + f.status).filter((v, i, x) => x.indexOf(v) === i),
    brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
    coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints };
})()`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
  clip: { x: section ? info.left : 0, y: info.top, width: section ? info.width : W, height: info.bottom - info.top, scale: 1 } });
writeFileSync(`${out}.png`, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ width: W, mobile: M, errors, ...info, file: `${out}.png` }));
} finally { ws?.close(); chrome.kill(); if (section && chrome.exitCode === null && chrome.signalCode === null) await new Promise(resolve => chrome.once('exit', resolve)); }
