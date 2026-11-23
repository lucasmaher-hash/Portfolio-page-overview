(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const captureMode = params.get('section-capture') === '1';
  const local = location.protocol === 'http:' && ['127.0.0.1:8765', 'localhost:8765'].includes(location.host);
  const status = document.createElement('p');
  status.className = 'copy-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.body.append(status);
  let busy = false, reset;
  const say = message => {
    clearTimeout(reset);
    status.textContent = message;
    status.hidden = false;
    reset = setTimeout(() => { status.hidden = true; }, 5500);
  };
  const download = (blob, id) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case-studyer-${id}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  for (const section of document.querySelectorAll('main > section.chapter[id]:not(#system)')) {
    const heading = section.querySelector(':scope > .chapter-heading');
    const title = heading?.querySelector('h2')?.textContent.trim();
    if (!title) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-section';
    button.textContent = 'Kopieren';
    button.setAttribute('aria-label', `Abschnitt „${title}“ als Bild kopieren`);
    if (captureMode) button.style.visibility = 'hidden';
    if (!local) button.title = 'Öffnet die lokale Vorschau für den Bildexport';
    heading.append(button);
    button.addEventListener('click', async () => {
      if (busy) return;
      if (!local) {
        const page = document.querySelector('.agent-nav [aria-current="page"]').getAttribute('href');
        location.href = `http://127.0.0.1:8765/${page}#${section.id}`;
        return;
      }
      busy = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Kopieren …';
      const capture = fetch('/__section_png', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: section.id, width: document.documentElement.clientWidth, height: innerHeight,
          touch: matchMedia('(pointer: coarse)').matches, macbook: document.documentElement.dataset.screen === 'macbook',
          tab: section.querySelector('[role="tab"][aria-selected="true"]')?.id,
          split: section.querySelector('input[type="range"]')?.valueAsNumber })
      }).then(response => {
        if (!response.ok || response.headers.get('Content-Type') !== 'image/png') throw Error('PNG nicht verfügbar');
        return response.blob();
      });
      // Initiate the write in the click event, before awaiting the PNG (Safari user activation).
      try {
        if (!navigator.clipboard?.write || !window.ClipboardItem) throw Error('Zwischenablage nicht unterstützt');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': capture })]);
        say('Bild kopiert. Mit ⌘V einfügen.');
      } catch {
        try {
          download(await capture, section.id);
          say('Zwischenablage nicht verfügbar. PNG heruntergeladen.');
        } catch {
          say('Bild konnte nicht erstellt werden. Bitte erneut versuchen.');
        }
      } finally {
        busy = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Kopieren';
      }
    });
  }
})();
