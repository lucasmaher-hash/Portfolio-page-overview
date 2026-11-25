// Browser regression test for the Case Studyer component catalogue.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const input = process.argv[2] ?? 'http://127.0.0.1:8765/';
const base = new URL('./', input).href;
const publicBuild = process.env.CASE_PUBLIC === '1';
const out = process.argv[3];
const profile = mkdtempSync(join(tmpdir(), 'catalogue-'));
const bin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(bin, ['--headless=new','--remote-debugging-port=0','--no-first-run',`--user-data-dir=${profile}`,'about:blank'], {stdio:'ignore'});
const sleep = t => new Promise(r=>setTimeout(r,t));
let ws;
try {
  let target;
  for (let i=0;i<60&&!target;i++) {
    try {
      const port = readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');
    } catch { await sleep(150); }
  }
  assert(target,'Chrome CDP did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0; const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const send=async(method,params={})=>{
    const i=++id; const m=await new Promise(r=>{pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
    if(m.error)throw Error(`${method}: ${JSON.stringify(m.error)}`);return m.result;
  };
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message))'});
  const load=async prefix=>{
    const u=base+'Case-Studyer-'+prefix+'.html';
    await send('Page.navigate',{url:u});
    let ready=false;
    for(let i=0;i<80&&!ready;i++) { try {ready=await ev(`location.href === ${JSON.stringify(u)} && document.readyState === 'complete'`);} catch {} if(!ready) await sleep(100); }
    assert(ready,u);await ev('document.fonts.ready.then(()=>true)');
  };
  const click=async s=>{
    const [x,y]=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  };
  const capture=async (s,w,name)=>{
    if(!out)return;
    await ev(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({block:'center',behavior:'instant'})`);
    await sleep(140);
    const r=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(out,`${name}-${w}.png`),Buffer.from(r.data,'base64'));
  };
  for (const width of [1440,768,390]) {
    const mobile=width<600;
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile});
    await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const page of ['UI-Elemente','Agentic-Workflow','Struktur','Wireframes','Bildgenerierung']) {
      await load(page);
      const result=await ev(`(()=>{
        const $=s=>document.querySelector(s);const css=e=>getComputedStyle(e);const sections=[...document.querySelectorAll('main>section')];
        const flat=sections.filter(e=>!['system','struktur'].includes(e.id));const links=[...document.querySelectorAll('.agent-nav a')];
        return {errors:window.__errors,overflow:document.documentElement.scrollWidth-innerWidth,active:links.filter(e=>e.getAttribute('aria-current')==='page').map(e=>e.getAttribute('href')),links:links.length,
        broken:[...document.images].filter(e=>!e.complete||!e.naturalWidth).length, duplicate:document.querySelectorAll('[id]').length-new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size,
        count:sections.length,frame:flat.every(e=>css(e).borderTopStyle==='solid'&&parseFloat(css(e).borderRadius)>0&&e.querySelector('.chapter-heading').getBoundingClientRect().bottom<e.getBoundingClientRect().top),copies:document.querySelectorAll('.copy-section').length,altSections:sections.map(x=>x.id),video:document.querySelectorAll('video').length,eff:matchMedia('(prefers-reduced-motion: reduce)').matches,
        assets:performance.getEntriesByType('resource').filter(r=>!r.name.startsWith('data:')&&!r.name.startsWith(location.origin)).length}
      })()`);
      const msg=`${page} @ ${width}: ${JSON.stringify(result)}`;
      assert.equal(result.links,5,msg);assert.deepEqual(result.active,[`Case-Studyer-${page}.html`],msg);assert.equal(result.overflow,0,msg);assert.equal(result.broken,0,msg);assert.equal(result.duplicate,0,msg);assert.deepEqual(result.errors,[],msg);assert.equal(result.assets,0,msg);assert.equal(result.video,0,msg);assert(result.frame,msg);
      if(['Agentic-Workflow','Struktur'].includes(page))assert.equal(result.count,1,msg);
      else assert.equal(result.copies,publicBuild?0:result.count,msg);
      if(page==='UI-Elemente') {
        assert(!result.altSections.includes('vorher')&&!result.altSections.includes('iterationen'),msg);
        for(const [a,b] of [['statistik','statistics-pie'],['wettbewerbsanalyse','market-research'],['erkenntnisse','evidence-synthesis'],['phone-portrait','phone-landscape']])assert.equal(result.altSections.indexOf(b),result.altSections.indexOf(a)+1,msg);
        await capture('#phone-landscape',width,'phones');await capture('#alternativen',width,'decision');await capture('#fakten',width,'facts');await capture('#statistics-pie',width,'pie');
        await click('#phone-portrait .phone-turn');
        const features=await ev(`(()=>{const $=s=>document.querySelector(s);const css=s=>getComputedStyle($(s));const phone=$('#phone-portrait .demo-phone').getBoundingClientRect();const ink=css('.meta-label').color;const hair=css('.table-wrap').borderTopColor;const pre=css('.lab-pie').backgroundImage;
          document.documentElement.style.setProperty('--page-accent','#9e2c69');
          const insets=[...document.querySelectorAll('main>section *')].filter(e=>getComputedStyle(e).boxShadow.includes('inset')).map(e=>e.className);
          return {turn:$('#phone-portrait .phone-feature').dataset.orientation,wide:phone.width>phone.height,ink,updated:css('.meta-label').color,pie:pre!==css('.lab-pie').backgroundImage,pieFull:css('.lab-pie').getPropertyValue('--lab-pie-reveal').trim(),hair:hair===css('.table-wrap').borderTopColor,insets,legend:!!$('.flowmap [transform="translate(20 528)"]'),solid:css('.empathy-center').borderBottomStyle,cover:$('#auftakt .ph-hero').getBoundingClientRect().left-$('#auftakt').getBoundingClientRect().left}
        })()`);
        assert.equal(features.turn,'landscape');assert(features.wide);assert.equal(features.ink,'rgb(71, 95, 126)');assert.equal(features.updated,'rgb(158, 44, 105)');assert(features.pie);assert.equal(features.pieFull,'100');assert(features.hair);assert.deepEqual(features.insets,['meta-grid']);assert(!features.legend);assert.equal(features.solid,'solid');assert(Math.abs(features.cover-1)<1.1,JSON.stringify(features));
        await capture('#erkenntnisse',width,'findings');
      } else if(page==='Wireframes') {
        const r=await ev(`(()=>{const a=[...document.querySelectorAll('.wireflow-svg')], nodes=[...document.querySelectorAll('.wireflow-svg [stroke="#607D9E" i],.wireflow-svg [fill="#607D9E" i]')]; const paints=()=>nodes.map(x=>getComputedStyle(x)[x.getAttribute('stroke')?.toUpperCase()==='#607D9E'?'stroke':'fill']); const blue=paints().every(x=>x==='rgb(71, 95, 126)');document.documentElement.style.setProperty('--page-accent','#9e2c69');return {count:a.length,annotationCount:nodes.length,blue,pink:paints().every(x=>x==='rgb(158, 44, 105)'),raster:a.some(x=>x.querySelector('image'))}})()`);
        assert.equal(r.count,publicBuild?6:7);assert(r.annotationCount>0&&r.blue&&r.pink&&!r.raster,JSON.stringify(r));
      } else if(page==='Bildgenerierung') {
        const r=await ev(`Array.from(document.querySelectorAll('.note-art img')).map(x=>[x.naturalWidth,x.naturalHeight])`);
        assert.deepEqual(r,publicBuild?[]:[[224,222],[224,222],[224,222]]);
        await capture('#agent-images',width,'art');
      }
      console.log(`${width} ${page}: ${result.count} sections, nav and layout OK`);
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await load('UI-Elemente');
  const pie=()=>ev(`parseFloat(getComputedStyle(document.querySelector('.lab-pie')).getPropertyValue('--lab-pie-reveal'))`);
  assert.equal(await pie(),0);
  await ev(`document.querySelector('.lab-pie').scrollIntoView({block:'center',behavior:'instant'})`);
  let mid=0;
  for(let i=0;i<28 && mid===0;i++){await sleep(50);mid=await pie();}
  assert(mid>0&&mid<100,`pie midway ${mid}`);
  await sleep(1300);assert.equal(await pie(),100);
  console.log('Pie animates 0 → intermediate → 100; reduced-motion and accent checks passed.');
} finally {
  ws?.close();chrome.kill();
  if(chrome.exitCode===null&&chrome.signalCode===null) await new Promise(r=>chrome.once('exit',r));
  rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
