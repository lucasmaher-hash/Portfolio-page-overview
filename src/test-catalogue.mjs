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
        const shell=$('.page');const limits=shell.getBoundingClientRect();
        const segmented=!flat.length||(css(shell).borderLeftWidth==='0px'&&css(shell).borderRightWidth==='0px'&&flat.every((e,i)=>{
          const r=e.getBoundingClientRect();const s=css(e);const gap=i===0?1:r.top-flat[i-1].getBoundingClientRect().bottom;
          return Math.abs(r.left-limits.left)<1&&Math.abs(r.right-limits.right)<1&&gap>0&&['Top','Right','Bottom','Left'].every(side=>s['border'+side+'Width']==='1px'&&s['border'+side+'Style']==='solid'&&s['border'+side+'Color']==='rgb(111, 111, 111)');
        }));
        if(flat.length&&!segmented)throw Error('Catalogue sections must share the portfolio rails with real gaps and no enclosing side border');
        const pad=Math.min(82,Math.max(44,innerWidth*.064));
        if(flat.some(e=>{const s=css(e);return Math.abs(parseFloat(s.paddingTop)-pad)>.1||s.paddingTop!==s.paddingBottom||s.backgroundColor!=='rgba(0, 0, 0, 0)';}))throw Error('Specimen frames must be transparent with equal top and bottom spacing');
        if(links[0]?.textContent.trim()!=='Agentic Overview')throw Error('Agentic Overview must be the first navigation label');
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
        const strokes=await ev(`(()=>{
          const e=document.querySelector('.empathy');const borders=node=>{const s=getComputedStyle(node);return ['Top','Right','Bottom','Left'].map(edge=>s['border'+edge+'Width']==='0px'?0:s['border'+edge+'Width']+' '+s['border'+edge+'Style']+' '+s['border'+edge+'Color']);};
          const [first,second,third,fourth,center]=[...e.children];
          return [e,first,second,third,fourth,center,e.querySelector('.slot')].map(borders);
        })()`);
        const rule='1px solid rgba(111, 111, 111, 0.18)';
        const rows=mobile?[[0,0,rule,0],[0,0,rule,0],[0,0,rule,0],[0,0,0,0],[0,0,rule,0]]:[[0,rule,rule,0],[0,0,rule,0],[0,rule,0,0],[0,0,0,0],Array(4).fill(rule)];
        assert.deepEqual(strokes,[Array(4).fill(rule),...rows,Array(4).fill(rule)],'Empathy map: explicit single thin strokes only');
        const details=await ev(`(()=>{
          const $=s=>document.querySelector(s),rect=s=>$(s).getBoundingClientRect();
          const panel=$('.insights-panel'),divider=getComputedStyle($('.insights-concerns'),'::before');
          const pale=panel&&getComputedStyle(panel).backgroundColor==='rgba(0, 0, 0, 0)';
          const excerpts=[...document.querySelectorAll('.evidence-entries blockquote')].every(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)');
          const matrix=getComputedStyle($('#alternativen .table-wrap'));
          const place=id=>{const p=rect(id+' .demo-phone'),b=rect(id+' .phone-turn'),c=rect(id+' .phone-feature-text'),frame=rect(id);return {right:b.left-p.right,below:b.top-p.bottom,edge:b.right-p.right,center:(b.y+b.height/2-p.top)/p.height,inside:b.left>=frame.left&&b.right<=frame.right&&b.bottom<=frame.bottom,clear:b.right<c.left||b.bottom<c.top||b.top>c.bottom};};
          return {pale,excerpts,vertical:divider.borderLeftWidth,horizontal:divider.borderTopWidth,matrixFill:matrix.backgroundImage,matrixClip:matrix.backgroundClip,cellFill:getComputedStyle($('.decision-table th:last-child')).backgroundColor,portrait:place('#phone-portrait'),landscape:place('#phone-landscape')};
        })()`);
        assert(details.pale&&details.excerpts,JSON.stringify(details));
        assert.equal(details.vertical,width>600?'1px':'0px');assert.equal(details.horizontal,width>600?'0px':'1px');
        assert.match(details.matrixFill,/^linear-gradient\(to left/);assert.equal(details.matrixClip,'padding-box');assert.equal(details.cellFill,'rgba(0, 0, 0, 0)');
        for(const p of [details.portrait,details.landscape])assert(p.clear&&p.inside,JSON.stringify(details));
        assert(Math.abs(details.landscape.edge)<1&&Math.abs(details.landscape.below-(width>860?18:12))<1,JSON.stringify(details));
        assert(width>860?Math.abs(details.portrait.right-18)<1&&Math.abs(details.portrait.center-.92)<.01:Math.abs(details.portrait.below-12)<1&&Math.abs(details.portrait.edge)<1,JSON.stringify(details));
        await capture('#erkenntnisse',width,'findings');await capture('#phone-portrait',width,'portrait');
        await capture('#empathy',width,'empathy');
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
        const contract=await ev(`(()=>{const wrapper=document.querySelector('[data-wf-page-accent]');
          const fixture=document.createElement('div');fixture.innerHTML='<svg class="wireflow-svg" style="--wf-export-accent:#a04358"><path data-wf-accent="stroke fill" stroke="#a04358" fill="#a04358"/><path data-wf-accent="stroke" stroke="#a04358" fill="none"/><path fill="#212121"/></svg>';wrapper.append(fixture);
          const [both,ring,neutral]=fixture.querySelectorAll('path');const paint=()=>[getComputedStyle(both).stroke,getComputedStyle(both).fill,getComputedStyle(ring).stroke,getComputedStyle(ring).fill,getComputedStyle(neutral).fill];
          const themed=paint();wrapper.removeAttribute('data-wf-page-accent');const standalone=paint();wrapper.setAttribute('data-wf-page-accent','');fixture.remove();return {themed,standalone};})()`);
        assert.deepEqual(contract.themed,['rgb(158, 44, 105)','rgb(158, 44, 105)','rgb(158, 44, 105)','none','rgb(33, 33, 33)']);
        assert.deepEqual(contract.standalone,['rgb(160, 67, 88)','rgb(160, 67, 88)','rgb(160, 67, 88)','none','rgb(33, 33, 33)']);
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
  const samples=await ev(`new Promise(resolve=>{
    const element=document.querySelector('.lab-pie');let mid=0;
    const until=performance.now()+3000;
    const sample=()=>{
      const value=parseFloat(getComputedStyle(element).getPropertyValue('--lab-pie-reveal'));
      if(value>0&&value<100)mid=value;
      if(value===100||performance.now()>until)resolve({mid,final:value});
      else requestAnimationFrame(sample);
    };
    element.scrollIntoView({block:'center',behavior:'instant'});
    sample();
  })`);
  assert(samples.mid>0&&samples.mid<100,`pie midway ${samples.mid}`);
  assert.equal(samples.final,100);
  console.log('Pie animates 0 → intermediate → 100; reduced-motion and accent checks passed.');
} finally {
  ws?.close();chrome.kill();
  if(chrome.exitCode===null&&chrome.signalCode===null) await new Promise(r=>chrome.once('exit',r));
  rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
