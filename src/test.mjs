// Interaction test over CDP: tabs (click + real arrow keys), slider, video, tab order, reduced motion.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
const url = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9335', '--autoplay-policy=no-user-gesture-required', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cst-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch('http://127.0.0.1:9335/json')).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const n = ++id; p.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
const key = async (k, code) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: code || k, windowsVirtualKeyCode: { Tab: 9, ArrowRight: 39, ArrowLeft: 37, End: 35 }[k] }); };
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url }); await sleep(3000);
const out = {};
out.tabClick = await ev(`document.getElementById('tab-v2').click(); [document.getElementById('panel-v2').hidden, document.getElementById('panel-v1').hidden].join()`); // expect false,true
await ev(`document.getElementById('tab-v1').click(); document.getElementById('tab-v1').focus(); true`);
await key('ArrowRight'); out.arrowRight = await ev(`document.activeElement.id + ':' + !document.getElementById('panel-v2').hidden`);
await key('End'); out.end = await ev(`document.activeElement.id`);
out.slider = await ev(`const r=document.getElementById('split'); r.value=20; r.dispatchEvent(new Event('input')); document.getElementById('compare').style.getPropertyValue('--split') + ' / ' + r.getAttribute('aria-valuetext')`);
out.videos = await ev(`document.querySelectorAll('video').length`);
out.reducedMotion = await ev(`[matchMedia('(prefers-reduced-motion: reduce)').matches, getComputedStyle(document.querySelector('.tabs button')).transitionDuration, getComputedStyle(document.documentElement).scrollBehavior].join()`);
await ev(`document.activeElement.blur(); window.scrollTo(0,0); true`);
const order = [];
for (let i = 0; i < 40; i++) { await key('Tab'); order.push(await ev(`(()=>{const a=document.activeElement;return a===document.body?'body':(a.id||a.getAttribute('aria-label')||a.className||a.tagName).toString().slice(0,40)})()`)); }
out.tabOrder = order;
out.focusVisible = await ev(`(()=>{document.getElementById('split').focus({focusVisible:true});return getComputedStyle(document.getElementById('split')).outlineStyle})()`);
out.inertNavFocusable = await ev(`[...document.querySelectorAll('[inert] *')].some(e=>e.matches(':focus-visible'))`);
out.noExternal = await ev(`performance.getEntriesByType('resource').filter(r=>!r.name.startsWith('data:')&&!r.name.startsWith(location.origin)).map(r=>r.name)`);
console.log(JSON.stringify(out, null, 1));
ws.close(); chrome.kill();
