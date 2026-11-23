// Measure layout boxes of a page in headless Chrome: node measure.mjs <url> <width> <mobile> <js-expression returning JSON>
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [url, width, mobile, expr] = process.argv.slice(2);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9334', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'csm-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const n = ++id; p.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: 900, deviceScaleFactor: 1, mobile: mobile === '1' });
await send('Page.navigate', { url }); await sleep(3500);
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify(r.result.result.value ?? r.result));
ws.close(); chrome.kill();
