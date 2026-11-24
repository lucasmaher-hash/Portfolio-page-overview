// Struktur & Text page check: node test-struktur.mjs <url> <width> <mobile 0|1> <out-prefix>
// Measures box sizes/centring, clicks boxes with trusted mouse events, checks connectors follow the boxes.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, width, mobile, out] = process.argv.slice(2);
const W = Number(width), M = mobile === '1';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9344', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cst-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, target;
try {
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch('http://127.0.0.1:9344/json')).json()).find(t => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errs=[];addEventListener("error",e=>__errs.push(e.message))' });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: M ? 844 : 1000, deviceScaleFactor: 2, mobile: M });
  if (M) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(250);
  await ev('document.fonts.ready.then(()=>true)'); await sleep(500);

  const click = async sel => {
    await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'center',behavior:'instant'})`); await sleep(350);
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    await sleep(250);
  };
  // Geometry + connector audit, evaluated in the page.
  const audit = () => ev(`(() => {
    const main = document.querySelector('.smap-main'), mr = main.getBoundingClientRect();
    const sb = [...document.querySelectorAll('.sb')], heads = sb;
    const centre = mr.left + mr.width / 2;
    const rows = [...document.querySelectorAll('.srow')].map(r => [...r.children].map(c => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }));
    const headSizes = [...new Set(heads.map(h => Math.round(h.offsetWidth) + 'x' + Math.round(h.offsetHeight)))];
    const open = sb.filter(s => s.getAttribute('aria-expanded') === 'true').length;
    // connector arrow tips: every box except the first row must have a path ending within 3px above its top edge
    const paths = [...document.querySelectorAll('.smap-svg path[marker-end]')].map(p => { const e = p.getPointAtLength(p.getTotalLength()); return { x: e.x + mr.left, y: e.y + mr.top }; });
    const stk = g => g.length > 1 && !g.every(i => Math.abs(i.t - g[0].t) < 2);
    const tops = rows.slice(1).flatMap(g => stk(g) ? [g[0]] : g);
    const unfed = tops.filter(b => { const cx = (b.l + b.r) / 2; return !paths.some(p => Math.abs(p.x - cx) < 2 && Math.abs(p.y - b.t) < 3); }).length;
    const outside = [...main.querySelectorAll('.sb')].filter(s => { const b = s.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth + 1; }).length;
    return { headSizes, open, arrows: paths.length, boxesWithoutArrow: unfed, boxesOutside: outside, overflow: document.documentElement.scrollWidth - innerWidth,
      centredSingles: [...document.querySelectorAll('.srow--one .sb')].map(s => { const b = s.getBoundingClientRect(); return Math.round((b.left + b.right) / 2 - centre); }),
      navLinks: [...document.querySelectorAll('.agent-nav .pill__seg')].map(a => ({ t: a.textContent.trim(), w: Math.round(a.getBoundingClientRect().width), cur: a.getAttribute('aria-current'), clipped: a.scrollWidth > a.clientWidth + 1 })),
      errors: window.__errs };
  })()`);
  console.log('closed', JSON.stringify(await audit()));
  const panelState = () => ev(`(() => { const p = document.getElementById('sp-panel'), r = p.getBoundingClientRect(), o = document.querySelector('.sb[aria-expanded="true"]');
    return { hidden: p.hidden, side: p.dataset.side, title: document.getElementById('sp-title').textContent, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      rect: [r.left, r.top, r.right, r.bottom].map(Math.round), scrollY: Math.round(scrollY), expanded: document.querySelectorAll('.sb[aria-expanded="true"]').length,
      dimmed: [...document.querySelectorAll('.sb')].filter(b => getComputedStyle(b).opacity < 0.5).length, focus: document.activeElement.id,
      opener: o && o.getBoundingClientRect().height }; })()`);
  for (const key of ['hero', 'fakten', 'problem', 'desk', 'beobachtung', 'iterationen', 'prototyp', 'test', 'evaluierung', 'lernen']) {
    await click(`.sb[data-key="${key}"]`); await sleep(300);
    const before = await ev('Math.round(scrollY)'); const st = await panelState();
    console.log('open', key, JSON.stringify(st), st.scrollY === before ? 'scroll-stable' : 'SCROLLED');
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(150);
  }
  await ev('scrollTo({top:0,behavior:"instant"})'); await sleep(300);
  const info = await ev(`(() => { const r = document.querySelector('#struktur').getBoundingClientRect(); return { top: r.top + scrollY, h: r.height }; })()`);
  await click('.sb[data-key="desk"]'); await sleep(300);
  await ev('scrollTo({top:0,behavior:"instant"})'); await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: W, height: 10, scale: 1 } });
  // screenshot of the visible area with the panel open
  await click('.sb[data-key="wettbewerb"]'); await sleep(300);
  const vis = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}-panel.png`, Buffer.from(vis.result.data, 'base64'));
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(250);
  console.log('after-esc', JSON.stringify(await panelState()));
  await click('.sb[data-key="pivot"]'); await sleep(250);
  const o = await ev(`(() => { const b = document.querySelector('.smap-main').getBoundingClientRect(); return [b.left + 4, b.top + 4]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: o[0], y: o[1], button: 'left', clickCount: 1 });
  await sleep(250);
  console.log('after-outside', JSON.stringify(await panelState()));
  console.log('final-audit', JSON.stringify(await audit()));
} finally { ws?.close(); chrome.kill(); }
