"""Generate the placeholder user-flow map (node-and-branch form after reference 13, Siqi / Maxi 3D)
and put it into template.html at <!--FLOWMAP-->. Rerun after changing labels or layout."""
W, H = 130, 26
out = []
DASH = ' stroke-dasharray="3 3"'
TIP = ' marker-end="url(#fm-tip)"'


def node(cx, cy, label, kind='screen', w=W, detail=None):
    fill, stroke, ink = {'entry': ('none', 'var(--page-accent,#475F7E)', '#1A1A1A'), 'area': ('var(--page-accent,#475F7E)', 'var(--page-accent,#475F7E)', '#fff'),
                         'screen': ('var(--flow-fill,#cbd6e5)', 'var(--accent-orange,#809BBC)', '#1A1A1A')}[kind]
    weight = 600 if kind == 'area' else 500
    if detail:
        out.append(f'<g class="fm-detail" tabindex="0" role="img" aria-label="{label}: {detail}"><title>{detail}</title>')
    out.append(f'<rect x="{cx - w / 2}" y="{cy - H / 2}" width="{w}" height="{H}" rx="7" style="fill:{fill};stroke:{stroke}" stroke-width="1.2"/>'
               f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="11.5" font-weight="{weight}" fill="{ink}">{label}</text>')
    if detail:
        out.append('</g>')


def line(pts, dash=False, arrow=False):
    from math import hypot
    d = f'M{pts[0][0]} {pts[0][1]}'
    for (px, py), (x, y), (nx, ny) in zip(pts, pts[1:], pts[2:]):
        a, b = hypot(px-x, py-y), hypot(nx-x, ny-y)
        if not a or not b:
            continue
        r = min(5, a/2, b/2)
        d += f' L{x+(px-x)*r/a:.2f} {y+(py-y)*r/a:.2f} Q{x} {y} {x+(nx-x)*r/b:.2f} {y+(ny-y)*r/b:.2f}'
    d += f' L{pts[-1][0]} {pts[-1][1]}'
    color = 'var(--page-accent,#475F7E)' if dash or arrow else '#6f6f6f'
    out.append(f'<path d="{d}" fill="none" style="stroke:{color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"{DASH if dash else ""}{TIP if arrow else ""}/>')


def label(x, y, t):
    out.append(f'<text x="{x}" y="{y}" font-size="10.5" style="fill:var(--page-accent,#475F7E)" font-weight="600">{t}</text>')


node(500, 20, 'Start', 'entry')
line([(500, 33), (500, 55)])
out.append('<path d="M496.5 57.3 Q500 55 503.5 57.3 L528.5 73.7 Q532 76 528.5 78.3 L503.5 94.7 Q500 97 496.5 94.7 L471.5 78.3 Q468 76 471.5 73.7 Z" fill="#DCDCE3" style="stroke:var(--page-accent,#475F7E)" stroke-width="1.2"/>'
           '<text x="500" y="80" text-anchor="middle" font-size="10.5" fill="#1A1A1A">Account?</text>')
line([(500, 97), (500, 119)], arrow=True); label(506, 112, 'yes')
line([(532, 76), (623, 76)], arrow=True); label(556, 70, 'no')
node(690, 76, 'Sign up')
line([(690, 89), (690, 134), (567, 134)], arrow=True)
node(500, 134, 'Home', 'entry', detail='Start screen. Choose one of the five areas.')
line([(500, 147), (500, 168)]); line([(110, 168), (890, 168)])
for x, t in [(110, 'Area A'), (305, 'Area B'), (500, 'Area C'), (695, 'Area D'), (890, 'Area E')]:
    line([(x, 168), (x, 187)]); node(x, 200, t, 'area')
# A: two screens, the second opens three options
line([(110, 213), (110, 228)]); line([(55, 228), (170, 228)]); line([(55, 228), (55, 240)]); line([(170, 228), (170, 240)])
node(55, 253, 'Profile', w=100); node(170, 253, 'Settings', w=110)
line([(170, 266), (170, 276), (125, 276), (125, 366)])
for i, t in enumerate(['Option 1', 'Option 2', 'Option 3']):
    y = 294 + i * 36; line([(125, y), (130, y)]); node(185, y, t, w=110)
# B: list
line([(305, 213), (305, 232), (255, 232), (255, 320)])
for i, t in enumerate(['List', 'Status', 'Comment']):
    y = 250 + i * 35; line([(255, y), (260, y)]); node(315, y, t, w=110)
# C: four actions converge into detail, result, end
line([(500, 213), (500, 232)]); line([(440, 232), (560, 232)]); line([(440, 232), (440, 370)]); line([(560, 232), (560, 370)])
for i, t in enumerate(['Action 1', 'Action 2', 'Action 3', 'Action 4']):
    node(500, 248 + i * 33, t, w=110)
line([(440, 370), (560, 370)]); line([(500, 370), (500, 385)], arrow=True)
node(500, 400, 'Details', detail='Review the selected item before saving.'); line([(500, 413), (500, 430)], arrow=True)
node(500, 445, 'Save result'); line([(500, 458), (500, 477)])
out.append('<circle cx="500" cy="490" r="13" fill="none" stroke="#1A1A1A" stroke-width="1.6"/>'); label(520, 494, 'End')
# D: chain, three options, summary that links back into C
node(695, 250, 'Contacts'); line([(695, 263), (695, 281)], arrow=True)
node(695, 295, 'Call'); line([(695, 308), (695, 320)]); line([(640, 320), (750, 320)]); line([(640, 320), (640, 418)]); line([(750, 320), (750, 418)])
for i, t in enumerate(['Message', 'Share screen', 'Share camera']):
    node(695, 336 + i * 30, t, w=110)
line([(640, 418), (750, 418)]); line([(695, 418), (695, 431)], arrow=True)
node(695, 445, 'Summary')
line([(630, 445), (600, 445), (600, 400), (567, 400)], dash=True, arrow=True)
# E: overview, reached again from the result
node(890, 250, 'Overview')
line([(565, 452), (585, 470), (980, 470), (980, 250), (957, 250)], dash=True, arrow=True)
svg = ('<!--FLOWMAP:start--><svg class="flowmap" viewBox="0 0 1000 512" role="group" font-family="\'Roboto Flex\',Arial,sans-serif" '
       'aria-label="Example user flow: users without an account sign up first. The home screen leads to five areas with screens, lists, and options. Area C leads through the detail and results screens to the end. Dashed lines connect the areas.">'
       '<defs><marker id="fm-tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">'
       '<path d="M1 1 7 4 1 7" fill="none" style="stroke:var(--page-accent,#475F7E)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>'
       + ''.join(out) + '</svg><!--FLOWMAP:end-->')

import re
p = 'template.html'; s = open(p).read()
if '<!--FLOWMAP-->' in s:
    s = s.replace('<!--FLOWMAP-->', svg)
else:
    s = re.sub(r'<!--FLOWMAP:start-->.*?<!--FLOWMAP:end-->', lambda m: svg, s, flags=re.S)
if '.flowmap{' not in s:
    s = s.replace('.pinned-svg{', '.flowmap{display:block;width:100%;min-width:820px;height:auto}\n.flowmap-scroll{padding-bottom:6px}\n.pinned-svg{', 1)
open(p, 'w').write(s)
print('flowmap written')
