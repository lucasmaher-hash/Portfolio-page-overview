// Typewriter check for the Agentic Workflow demo captions: node test-typewriter.mjs <url> [reduced 0|1]
// Seeks the paused timeline (same clock the animation uses) and reads how much of each caption is visible.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, reduced = '0', shot] = process.argv.slice(2);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9355', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cstw-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, target;
try {
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch('http://127.0.0.1:9355/json')).json()).find(t => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result; return r?.result?.value; };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (reduced === '1') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(250);
  await ev('document.fonts.ready.then(()=>true)'); await sleep(600);
  await ev(`document.getElementById('map-play').scrollIntoView({block:'center',behavior:'instant'})`);
  await ev(`document.getElementById('map-play').click()`); await sleep(150);
  await ev(`document.getElementById('map-play').click()`); await sleep(150);   // pause: the clock now only moves by seeking
  const at = ms => ev(`(() => { const s = document.getElementById('map-seek'); s.value = ${ms}; s.dispatchEvent(new Event('input'));
    const c1 = document.getElementById('flow-cap'), c2 = document.getElementById('flow-cap-2'), r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top)]; };
    const box = k => { const e = document.querySelector('[data-agent="' + k + '"]'); return r(e); };
    return { c1: c1.hidden ? null : { sr: c1.querySelector('.sr-only').textContent.slice(0, 26), typed: c1.querySelector('.cap-typed').textContent.length, len: c1.querySelector('.sr-only').textContent.length, rect: r(c1) },
             c2: c2.hidden ? null : { t: c2.textContent.slice(0, 26), rect: r(c2) },
             cur: [...document.querySelectorAll('.is-current')].map(e => e.dataset.agent || e.id), files: box('files'), log: box('projektlog'), core: r(document.getElementById('map-core')),
             seekAccent: getComputedStyle(s).accentColor, total: +s.max }; })()`);
  const W = Number(process.env.W || 1440);
  const total = (await at(0)).total;
  const starts = {}; let last = '';
  for (let t = 0; t <= total; t += 40) { const r = await at(t); const k = r.c1?.sr ?? '-'; if (k !== last) { starts[k] = starts[k] ?? t; last = k; } }
  console.log('total', total, 'captions', Object.keys(starts).length); console.log(JSON.stringify(starts));
  for (const [prefix, name] of [['Portfolio Orchestrator:', 'orch'], ['Struktur & Text Agent:', 'struktur'], ['Wireframe Agent:', 'wire'], ['3D Agent (optional)', '3d'], ['Bild Agent (optional)', 'bild'], ['Abweichung 2:', 'fix2']]) {
    const k = Object.keys(starts).find(x => x.startsWith(prefix.slice(0, 22))); if (!k) { console.log('no caption', prefix); continue; }
    const r = await at(starts[k] + 1100); await sleep(250);
    const m = await ev(`(() => { const c = document.getElementById('flow-cap'), cr = c.getBoundingClientRect(); const roleName = ${JSON.stringify(name)};
      const keyMap = { struktur: 'struktur', wire: 'wireframes', '3d': '3d', bild: 'bilder', fix2: 'wireframes', orch: 'orchestrator' }; const b = document.querySelector('[data-agent="' + keyMap[roleName] + '"]').getBoundingClientRect();
      return { capLeft: Math.round(cr.left), capRight: Math.round(cr.right), capTop: Math.round(cr.top), capBottom: Math.round(cr.bottom), boxLeft: Math.round(b.left), boxRight: Math.round(b.right), boxBottom: Math.round(b.bottom), gapBelowBox: Math.round(cr.top - b.bottom), centreDelta: Math.round((cr.left + cr.right) / 2 - (b.left + b.right) / 2), covered: [...document.querySelectorAll('.cap-covered')].map(e => e.dataset.agent || e.id), cls: c.className }; })()`);
    console.log(name.padEnd(8), JSON.stringify(m));
    const box = await ev(`(() => { const m = document.querySelector('.map').getBoundingClientRect(); return { x: m.left, y: m.top + scrollY, w: m.width, h: m.height }; })()`);
    const sh = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
    writeFileSync(`${process.env.OUT}-${name}.png`, Buffer.from(sh.result.data, 'base64'));
  }
} finally { ws?.close(); chrome.kill(); }
