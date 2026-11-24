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
  const at = ms => ev(`(() => { const s = document.getElementById('map-seek'); s.value = ${ms}; s.dispatchEvent(new Event('input')); const c = document.getElementById('flow-cap');
    return { hidden: c.hidden, typed: c.querySelector('.cap-typed')?.textContent ?? '', rest: c.querySelector('.cap-rest')?.textContent ?? '', sr: c.querySelector('.sr-only')?.textContent ?? '',
             restVisibility: c.querySelector('.cap-rest') ? getComputedStyle(c.querySelector('.cap-rest')).visibility : null, h: c.offsetHeight, w: c.offsetWidth, top: c.style.top, left: c.style.left, total: +s.max }; })()`);
  const first = await at(0);
  const len0 = first.typed.length + first.rest.length, msPer = 1000 / len0;
  console.log('first caption length', len0, 'ms/char', msPer.toFixed(2));
  for (const t of [0, 250, 500, 750, 1000, 1500]) { const r = await at(t); console.log('t', t, 'typed', r.typed.length, '/', r.typed.length + r.rest.length, 'expected', Math.min(len0, Math.floor(t / msPer)), '| h', r.h, 'w', r.w, 'top', r.top, 'left', r.left); }
  // step starts, derived by scanning the timeline for caption changes
  const total = (await at(0)).total, seen = [];
  let lastSr = null;
  for (let t = 0; t <= total; t += 40) {
    const r = await at(t);
    if (!r.hidden && r.sr !== lastSr) { seen.push({ t, sr: r.sr }); lastSr = r.sr; }
  }
  console.log('captions found', seen.length, 'total ms', total);
  // for every caption: find the time it is fully typed, relative to when it first appeared (40 ms scan resolution)
  const rows = [];
  for (const c of seen) {
    let first = null, full = null;
    for (let t = Math.max(0, c.t - 40); t <= total; t += 10) {
      const r = await at(t);
      if (r.sr !== c.sr || r.hidden) { if (first !== null) break; continue; }
      if (first === null) first = t;
      if (r.rest.length === 0) { full = t; break; }
    }
    rows.push({ len: c.sr.length, appeared: first, fullyTyped: full, ms: full - first, perChar: ((full - first) / c.sr.length).toFixed(1), wrapStable: null });
  }
  console.table(rows.map(r => ({ len: r.len, ms: r.ms, 'ms/char': r.perChar })));
  // layout stability: height/top of one long caption at 20% and 100% typed
  const longest = seen.reduce((a, b) => (b.sr.length > a.sr.length ? b : a));
  const idx = seen.indexOf(longest);
  let mid = null, done = null;
  for (let t = Math.max(0, longest.t - 40); t <= total; t += 10) {
    const r = await at(t);
    if (r.sr !== longest.sr) continue;
    if (mid === null && r.typed.length > 10) mid = r;
    if (r.rest.length === 0) { done = r; break; }
  }
  console.log('longest caption', longest.sr.length, 'chars | partial h/top/left', mid.h, mid.top, mid.left, '| final', done.h, done.top, done.left, '| ghost visibility', mid.restVisibility);
  if (shot) {
    let t0 = longest.t; for (let t = t0 - 40; t < total; t += 10) { const r = await at(t); if (r.sr === longest.sr && r.typed.length > longest.sr.length * 0.5 && r.rest.length) { break; } t0 = t; }
    const r = await at(t0 + 10);
    const box = await ev(`(() => { const m = document.querySelector('.map').getBoundingClientRect(); return { x: m.left, y: m.top + scrollY, w: m.width, h: m.height }; })()`);
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
    writeFileSync(shot, Buffer.from(s.result.data, 'base64')); console.log('shot at partial', r.typed.length, '/', r.typed.length + r.rest.length);
  }
} finally { ws?.close(); chrome.kill(); }
