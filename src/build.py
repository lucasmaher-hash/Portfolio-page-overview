#!/usr/bin/env python3
"""Build three linked offline preview pages in Entwürfe/.

template.html holds the page. Markers resolved here:
  {{asset:<path under 3D_Portfolio/public>}}  -> base64 data URI (fonts, images, video)
  {{local:<file in ./assets>}}                -> base64 data URI (stills derived for this preview)
  <!--@src:<name>-->  /  /*@src:<name>*/      -> markup, CSS or JS cut out of the CURRENT
                                                 to.morrow2d.html / unify2d.html / nav file
url(/...) inside copied CSS is embedded the same way. Nothing is fetched from the network;
the portfolio repo is only read. A missing source marker or a remaining external URL stops
the build instead of shipping a gap.
"""
import base64, re, sqlite3, sys
from pathlib import Path
from xml.etree import ElementTree as ET

import cssx

HERE = Path(__file__).resolve().parent
DESIGN_TOOL = HERE.parent.parent
PUBLIC = Path.home() / "TEMP/3D_Portfolio/public"
TOMORROW = (PUBLIC / "to.morrow2d.html").read_text()
UNIFY = (PUBLIC / "unify2d.html").read_text()
ITERATION1 = (HERE / "backup/Case-Studyer-UI-Elemente.vor-Ueberarbeitung-2026-11-22.html").read_text()
CHROME_JS = (PUBLIC / "js/page-chrome.js").read_text()
OUT = DESIGN_TOOL / "Entwürfe/Case-Studyer-UI-Elemente.html"
MIME = {".woff2": "font/woff2", ".ttf": "font/ttf", ".webp": "image/webp", ".png": "image/png",
        ".jpg": "image/jpeg", ".mp4": "video/mp4"}


def fail(msg):
    sys.exit(f"build failed: {msg}")


def data_uri(path):
    if not path.is_file():
        fail(f"asset missing: {path}")
    if path.suffix not in MIME:
        fail(f"unknown type: {path.name}")
    return f"data:{MIME[path.suffix]};base64," + base64.b64encode(path.read_bytes()).decode()


def block(html, opening):
    """The element that starts with `opening`, through its matching </div>."""
    start = html.find(opening)
    if start < 0:
        fail(f"marker not found: {opening[:70]}")
    depth = 0
    for tag in re.finditer(r"<(/?)div\b", html[start:]):
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            return html[start:html.find(">", start + tag.start()) + 1]
    fail(f"unbalanced divs after {opening[:70]}")


def lines_between(html, first, last):
    rows = html.splitlines()
    try:
        a = next(i for i, r in enumerate(rows) if first in r)
        b = next(i for i in range(a, len(rows)) if last in rows[i])
    except StopIteration:
        fail(f"css marker not found: {first[:50]} .. {last[:50]}")
    return "\n".join(r.strip() for r in rows[a:b + 1])


def clean(markup):
    # Translation hooks belong to the live site's i18n script, which this file does not ship.
    markup = re.sub(r'\sdata-i18n(?:-html|-aria)?="[^"]*"', "", markup)
    # Everything is embedded, so lazy loading only delays images (and hides them from capture).
    markup = markup.replace(' loading="lazy"', '')
    # Outbound links (competitor sites) become plain labels: the preview links nowhere.
    markup = re.sub(r'<a class="([^"]*)" href="https?://[^"]*"[^>]*>(.*?)</a>', r'<span class="\1">\2</span>', markup)
    return re.sub(r'(src|poster)="(/[^"?]+)(\?[^"]*)?"', lambda m: f'{m.group(1)}="{{{{asset:{m.group(2)[1:]}}}}}"', markup)


# The catalogue shows forms, not to.morrow: every app-specific word in the copied phone drawings
# becomes a neutral placeholder (longest phrases first).
GENERIC = [("Ein Wisch verschiebt die Aufgabe. Rückgängig bleibt ein optionaler Schritt.", "Platzhaltertext für die Einleitung des Ablaufs."),
           ("Wieder unter Heute", "Wieder unter Liste A"), ("Skizzen sortieren", "Eintrag 1"), ("Portfolio senden", "Eintrag 2"),
           ("Einkaufen", "Eintrag 3"), ("Mails beantworten", "Eintrag 4"), ("Zahnarzt anrufen", "Eintrag 5"),
           ("Zimmer aufräumen", "Eintrag 6"), ("Steuern machen", "Eintrag 7"), ("Reisepass mitnehmen", "Eintrag 2"),
           ("to.morrow", "App-Name"), ("Personal", "Bereich"), ("Heute", "Liste A"), ("Morgen", "Liste B"),
           ("Bald", "Liste C"), ("Live", "Start"), ("Aufgabe", "Eintrag")]


def generic(markup):
    for old, new in GENERIC:
        markup = markup.replace(old, new)
    return markup


def screen(flow, n, prefix):
    """The n-th phone SVG of a to.morrow wireflow, ids prefixed so it can sit beside the original."""
    band = block(TOMORROW, f'<div class="flow-band no-shade wireflow wireflow--{flow}"')
    svgs = re.findall(r'<svg class="wireflow-phone".*?</svg>', band, re.S)
    if len(svgs) < n:
        fail(f"wireflow {flow} has no step {n}")
    svg = clean(svgs[n - 1])
    for old in set(re.findall(r'id="([^"]+)"', svg)):
        svg = re.sub(rf'(id="|url\(#|href="#|aria-labelledby="){re.escape(old)}(?=["\)])', rf"\g<1>{prefix}-{old}", svg)
    svg = svg.replace(' data-flow-anchor="', ' data-anchor="')  # only the copied bands get connector arrows
    return generic(svg.replace('class="wireflow-phone"', 'class="screen-svg"'))


TOMORROW_CLASSES = ["meta-grid", "meta-tile", "meta-label", "meta-inset", "section-heading-row", "section-title",
                    "step-badge", "dot-divider", "guide-text", "kw", "tap-card", "tap-shot", "tap-name", "tap-n",
                    "taps-wrap", "taps-cards", "chart-title", "big-statement", "paper", "ip-shot", "ip-screen",
                    "ip-frame", "project-title", "feature-title", "cs-h3", "fact-bar", "fact", "fact-num",
                    "fact-label", "fact-src"]
# Rules for other components on the live page that happen to share a class (rotating phone,
# video trio, hover tilts) - they would blur or move the copies here.
TOMORROW_DROP = ["rot-ip", "rot-text", "land-box", "trio-band", "trio-shots", "ic-copy", "color-card", "media-copy",
                 "guide-section", "centered-note", "stagger-figure", "morrow-devices", "dna"]
ITERATION1_CLASSES = ["research-card", "grid", "three", "mini-label", "journey", "matrix", "phone", "task", "sketch",
                      "version-tabs", "version-stage", "mock-button", "before-after", "range-row", "caption", "closing"]
UNIFY_CLASSES = ["stat-block", "stat-kicker", "stat-head", "statbar", "statbar-track", "statbar-seg", "seg-words",
                 "statbar-brace", "statbar-brace-line", "statbar-brace-text", "ba-chart", "ba-legend", "ba-group",
                 "ba-row", "chart-key", "chart-track", "chart-fill", "chart-val", "res-block", "res-note", "cs-sub"]


def css(html, classes, drop):
    text = cssx.extract(html, classes, drop)
    text = re.sub(r"[^{};]*:nth-child\(n\+2\) \.ip-screen video\{[^}]*\}", "", text)  # live-page trio blur
    return re.sub(r"url\((['\"]?)(/[^)'\"?]+)(\?[^)'\"]*)?\1\)", lambda m: f"url({{{{asset:{m.group(2)[1:]}}}}})", text)


def root_tokens():
    m = re.search(r":root\s*\{([^}]*)\}", TOMORROW)
    return ":root{" + re.sub(r"\s+", " ", m.group(1)).strip() + "}" if m else fail("to.morrow :root not found")


def portfolio_nav_source():
    return (PUBLIC / 'top_row_permanent_V3.html').read_text()


def portfolio_nav_css():
    """Copy the real portfolio 2D island and button style, without the inner track."""
    live = portfolio_nav_source()
    style = re.sub(r'/\*.*?\*/', '', live.split('<style>', 1)[1].split('</style>', 1)[0], flags=re.S)
    tokens = ('bg-surface', 'text-primary', 'text-secondary', 'accent-orange', 'shadow-island',
              'island-light', 'ease', 'island-edge-x', 'island-edge-top')

    def declarations(selector):
        rules = re.findall(rf'^\s*{re.escape(selector)}\s*\{{([^}}]*)\}}', style, flags=re.M)
        return rules or fail(f'portfolio navigation CSS missing: {selector}')

    def token_rule(values, names):
        props = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', values))
        if missing := [n for n in names if '--' + n not in props]:
            fail(f'portfolio navigation tokens missing: {missing}')
        return '.agent-nav,.agent-nav-light{' + ''.join(f'--{n}:{props["--" + n]};' for n in names) + '}'

    rules = [token_rule(declarations(':root')[0], tokens)]
    selectors = {'.nav-island': '.agent-nav', '.nav-island.is-2d-mode': '.agent-nav.is-2d-mode',
                 '.nav-light': '.agent-nav-light', '.nav-light.on': '.agent-nav-light.on',
                 '.nav-light-shape': '.agent-nav-light-shape',
                 '.pill__seg': '.agent-nav .pill__seg', '.pill__seg:hover': '.agent-nav .pill__seg:hover',
                 '.pill__seg:focus-visible': '.agent-nav .pill__seg:focus-visible',
                 '.pill__seg.is-active': '.agent-nav .pill__seg[aria-current="page"]'}
    rules += [f'{out}{{{declarations(source)[0]}}}' for source, out in selectors.items()]
    mobile_tokens = next((rule for rule in declarations(':root')[1:] if '--shadow-island:' in rule), None)
    if mobile_tokens is None:
        fail('portfolio navigation mobile shadow tokens missing')
    rules.append('@media(max-width:640px){' + token_rule(mobile_tokens, ('shadow-island', 'island-light')) + '}')
    return '\n'.join(rules)


def portfolio_nav_lighting():
    live = portfolio_nav_source()
    start = live.rfind('    (function () {')
    script = live[start:].split('</script>', 1)[0]
    if not all(marker in script for marker in ('.nav-light-shape', 'function collect()', 'path(evenodd,', 'function syncOn()')):
        fail('portfolio navigation light script not found')
    script = (script.replace('.nav-light', '.agent-nav-light').replace('.nav-island', '.agent-nav')
              .replace("if (cs.position === 'fixed' ||", "if (el === island || cs.position === 'fixed' ||")
              .replace('      recollect();\n      setTimeout', '''      function followSlide(e) {
        if (e.target !== island || e.propertyName !== 'transform') return;
        var start = performance.now();
        function follow(now) {
          update();
          if (now - start < 350) requestAnimationFrame(follow);
        }
        requestAnimationFrame(follow);
      }
      island.addEventListener('transitionrun', followSlide);
      recollect();
      setTimeout'''))
    return script


FRAGMENTS = {
    "spotify:wireflow:svg": lambda: (HERE.parent / 'projekte/spotify/visuals/spotify-search-and-play.svg').read_text().strip(),
    "findmy:wireflow:svg": lambda: (HERE.parent / 'projekte/findmy/visuals/findmy-find-nearby.svg').read_text().strip(),
    "passwords:wireflow:svg": lambda: (HERE.parent / 'projekte/passwords/visuals/passwords-share-group.svg').read_text().strip(),

    "lab:js:section-copy": lambda: (HERE / "section-copy.js").read_text(),
    "portfolio:css:nav": portfolio_nav_css,
    "portfolio:js:nav-light": portfolio_nav_lighting,
    "tomorrow:wireflow:reschedule": lambda: (HERE.parent / 'projekte/tomorrow/visuals/tomorrow-reschedule.svg').read_text().strip(),
    "tomorrow:wireflow:draft": lambda: (HERE.parent / 'projekte/tomorrow/visuals/tomorrow-draft.svg').read_text().strip(),
    "tomorrow:wireflow:live": lambda: (HERE.parent / 'projekte/tomorrow/visuals/tomorrow-live.svg').read_text().strip(),
    "tomorrow:fact-bar": lambda: clean(block(TOMORROW, '<div class="fact-bar">')),
    # The live page hides these <br> (".meta-inset br{display:none}"), which glues "Produktdesign,Designsystem";
    # a space before each keeps the words apart in both layouts.
    "tomorrow:meta-grid": lambda: clean(block(TOMORROW, '<div class="meta-grid">')).replace("<br>", " <br>"),
    "tomorrow:taps": lambda: clean(block(TOMORROW, '<div class="taps-cards">')),
    "tomorrow:css:root": root_tokens,
    "tomorrow:css:wireflow": lambda: lines_between(TOMORROW, ".band-head, .chart-head {", "--wire-phone-min: 176px; --wireflow-pad: 18px;") + "\n}",
    "tomorrow:css:components": lambda: css(TOMORROW, TOMORROW_CLASSES, TOMORROW_DROP),
    "unify:css:charts": lambda: css(UNIFY, UNIFY_CLASSES, ["hero", "home-copy", "imsg-stage", "cs-section"]),
    # The live page's dot scrollbar: CSS block, markup and the first IIFE of the shared page-chrome.js
    "tomorrow:css:scrollbar": lambda: lines_between(TOMORROW, "html { scrollbar-width: none; }", "#scroll-track.is-dragging .scroll-dot { transform: scale(1.3); }") + "\n}",
    "tomorrow:scroll-track": lambda: block(TOMORROW, '<div id="scroll-track">'),
    "tomorrow:js:scroll-dots": lambda: CHROME_JS[CHROME_JS.index("(function () {"):CHROME_JS.index("})();") + 5],
    # The first version's own component rules, renamed to the real font families
    "iteration1:css:components": lambda: cssx.extract(ITERATION1, ITERATION1_CLASSES).replace("RobotoLocal", "'Roboto Flex'").replace("OCRLocal", "'OCR-A-BT'"),
}
for flow, count in (("reschedule", 4), ("live", 4), ("draft", 3)):
    for n in range(1, count + 1):
        FRAGMENTS[f"tomorrow:screen:{flow}:{n}"] = (lambda f=flow, k=n: lambda prefix: screen(f, k, prefix))()


def fragment(name):
    key, _, prefix = name.partition("@")
    if key not in FRAGMENTS:
        fail(f"unknown fragment: {key}")
    value = FRAGMENTS[key]
    return value(prefix or key.replace(":", "-")) if key.startswith("tomorrow:screen:") else value()


page = (HERE / "template.html").read_text()
page = re.sub(r"<!--@src:([\w:@-]+)-->|/\*@src:([\w:@-]+)\*/", lambda m: fragment(m.group(1) or m.group(2)), page)
def botchat(profile):
    """Id of a Hermes profile's canonical Bot Chat (Bot Mode), for hermes://open/c/<id> links."""
    db = Path.home() / f".hermes/profiles/{profile}/state.db"
    if not db.is_file():
        fail(f"no Hermes profile: {profile}")
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    row = con.execute("select id from sessions where title='Bot Chat' and archived=0 order by started_at desc limit 1").fetchone()
    con.close()
    return row[0] if row else fail(f"profile {profile} has no Bot Chat yet (open it once in the Bots tab)")


page = re.sub(r"\{\{botchat:([a-z0-9_-]+)\}\}", lambda m: botchat(m.group(1)), page)
page = re.sub(r"\{\{asset:([^}]+)\}\}", lambda m: data_uri(PUBLIC / m.group(1)), page)
page = re.sub(r"\{\{local:([^}]+)\}\}", lambda m: data_uri(HERE / "assets" / m.group(1)), page)
leftover = re.search(r"\{\{(asset|local|botchat):|@src:", page)
if leftover:
    fail("unresolved marker near: " + page[leftover.start():leftover.start() + 60])
# These exact, user-requested outbound links do not load resources at render time.
link_targets = (
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=37-15',
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=37-26',
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=37-40',
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=12-2',
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=15-2',
    'https://www.figma.com/design/AyHYeOoTBz8Y0sSCM52x2I/wireframes?node-id=18-2',
)
asset_check = page
for link in link_targets:
    asset_check = re.sub(r'(<a\s+(?:class="wireframe-figma"\s+)?)href="' + re.escape(link) + r'"', r'\1href="#"', asset_check)
external = re.search(r"""(?:src|href|url\()\s*=?\s*["']?(?:https?:)?//""", asset_check)
if external:
    fail("external reference: " + asset_check[external.start():external.start() + 80])
sections = {}
for id_ in ('system', 'flow', 'flow-reschedule', 'flow-live', 'flow-spotify', 'flow-findmy', 'flow-passwords', 'agent-images'):
    pattern = rf'^    <section class="chapter" id="{id_}".*?^    </section>\n'
    match = re.search(pattern, page, re.M | re.S)
    if not match:
        fail(f'missing example section: {id_}')
    sections[id_] = match.group()
    page = page[:match.start()] + page[match.end():]

# Every showcase specimen must render a single inline vector, not a raster fallback.
for flow_id, markup in sections.items():
    if flow_id != 'flow' and not flow_id.startswith('flow-'):
        continue
    try:
        wrapper, = re.findall(r'<div class="figma-flow-scroll"[^>]*>(.*?)</div>', markup, re.S)
        svg = ET.fromstring(wrapper.strip())
    except (ValueError, ET.ParseError) as exc:
        fail(f'{flow_id}: expected exactly one inline SVG ({exc})')
    tag = lambda el: el.tag.rsplit('}', 1)[-1].lower()
    forbidden = {'img', 'image', 'feimage', 'picture', 'source', 'canvas', 'foreignobject', 'object', 'embed', 'script'}
    if (tag(svg) != 'svg' or 'wireflow-svg' not in svg.get('class', '').split()
            or sum(tag(el) == 'svg' for el in svg.iter()) != 1
            or any(tag(el) in forbidden for el in svg.iter())
            or re.search(r'<(?:img|picture|source|canvas|object|embed)\b|data:image/', markup, re.I)):
        fail(f'{flow_id}: wireflow must be one inline vector SVG without raster content')

sections['flow'] += sections.pop('flow-reschedule') + sections.pop('flow-live') + sections.pop('flow-spotify') + sections.pop('flow-findmy') + sections.pop('flow-passwords')

pages = {
    'system': ('Case-Studyer-Agentic-Workflow.html', 'Agentic Workflow Overview'),
    'ui': (OUT.name, 'UI-Elemente'),
    'flow': ('Case-Studyer-Wireframes.html', 'Wireframes'),
    'agent-images': ('Case-Studyer-Bildgenerierung.html', 'Bildgenerierung'),
}
for key, (filename, label) in pages.items():
    result = page
    if key != 'ui':
        result, n = re.subn(r'(?s)(  <main>\n).*?(    <nav class="agent-nav".*?</nav>).*?(  </main>)',
                            lambda m: m[1] + m[2] + '\n\n' + sections[key] + m[3], result)
        if n != 1:
            fail('cannot isolate the examples page')
        result = re.sub(r'(?s)<script>\n// Iteration tabs:.*?</script>\n', '', result, count=1)
    if key != 'system':
        result = re.sub(r'(?s)<script>\n// Agent map:.*?</script>\n', '', result, count=1)
    nav = '\n'.join(f'      <a class="pill__seg" href="{name}"' + (' aria-current="page"' if target == key else '')
                    + '>' + text.replace('Bildgenerierung', 'Bild\u00adgenerierung') + '</a>'
                    for target, (name, text) in pages.items())
    result = result.replace('      <!-- Agent page links -->', nav)
    result = result.replace('<title>Portfolio Orchestrator · UI-Elemente</title>', f'<title>Portfolio Orchestrator · {label}</title>')
    output = OUT.with_name(filename)
    output.write_text(result)
    print(f'wrote {output} ({len(result) // 1024} KB)')
