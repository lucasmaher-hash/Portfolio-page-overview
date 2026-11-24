// Run: node test-workflow-handoffs.mjs <url> [reduced: 0|1] [width]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, reduced = '0', width = '1440'] = process.argv.slice(2);
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
  await send('Emulation.setDeviceMetricsOverride', { width: +width, height: 1000, deviceScaleFactor: 1, mobile: +width < 600 });
  if (reduced === '1') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(250);
  await ev('document.fonts.ready.then(()=>true)'); await sleep(600);
  await ev(`document.getElementById('map-play').scrollIntoView({block:'center',behavior:'instant'})`);
  await ev(`document.getElementById('map-play').click()`); await sleep(150);
  await ev(`document.getElementById('map-play').click()`); await sleep(150);   // pause: the clock now only moves by seeking
  const at = ms => ev(`(() => {
    const seek = document.getElementById('map-seek'); seek.value = ${ms}; seek.dispatchEvent(new Event('input'));
    const cap = document.getElementById('flow-cap'), active = [...document.querySelectorAll('g[data-step].now')];
    return { text: cap.querySelector('.sr-only')?.textContent, typed: cap.querySelector('.cap-typed')?.textContent.length,
      current: [...document.querySelectorAll('.is-current')].map(e => e.dataset.agent || e.id), active: active.map(g => g.dataset.step),
      paths: active.flatMap(g => [...g.querySelectorAll('path')].map(p => [g.dataset.step, p.style.strokeDashoffset])),
      right: cap.getBoundingClientRect().left > document.querySelector('[data-agent=projektlog]').getBoundingClientRect().right,
      max: +seek.max };
  })()`);
  const first = await at(0);
  assert.match(first.text, /^Project Files und Projektlog/);
  assert.deepEqual(first.current, ['files', 'projektlog']);
  if (reduced === '1') {
    assert.equal(first.typed, first.text.length);
    console.log('Reduced motion: full intro displayed immediately');
  } else {
    const early = await at(250);
    assert(early.paths.some(([, offset]) => parseFloat(offset) > 0 && parseFloat(offset) < 1), 'arrows already drawing by 250 ms');
    assert.deepEqual((await at(3550)).current, first.current);
    if (+width === 1440) assert(early.right, 'caption right of Projektlog');
    const plan = await at(3600);
    assert.deepEqual(plan.current, ['orchestrator']);
    assert.deepEqual(plan.active, []);
    const stages = [];
    let previous = '';
    for (let time = 0; time < first.max; time += 40) {
      const v = await at(time), key = JSON.stringify([v.text, v.active]);
      if (key !== previous) stages.push({ time, ...v });
      previous = key;
    }
    assert(!stages.some(v => v.text.startsWith('Case Study Output:')));
    const handoff = stages.find(v => v.active.includes('fan-struktur'));
    assert.deepEqual(handoff.active, ['trunk', 'fan-struktur']);
    const underway = await at(handoff.time + 300);
    assert.match(underway.text, /^Struktur & Text Agent/);
    assert(underway.typed > 0 && underway.typed < underway.text.length);
    assert(underway.paths.some(([, d]) => parseFloat(d) > 0 && parseFloat(d) < 1), JSON.stringify(underway.paths));
    const returns = stages.filter(v => v.active.some(k => k === 'join' || k.startsWith('join-')));
    assert.deepEqual(returns.map(v => v.active), [['join'], ['join-struktur'], ['join-wireframes'], ['join-ui']]);
    for (const v of returns) {
      const mid = await at(v.time + 300);
      assert(mid.typed > 0 && mid.typed < mid.text.length);
      assert(mid.paths.some(([, d]) => parseFloat(d) > 0 && parseFloat(d) < 1));
      if (v.active[0] !== 'join' && +width === 1440) assert.equal(mid.paths.length, 2);
    }
    console.log(`${width}px: intro draws immediately, input boxes active for 3.6 s, continuous handoff, early typing, isolated correction paths`);
  }
} finally { ws?.close(); chrome.kill(); }
