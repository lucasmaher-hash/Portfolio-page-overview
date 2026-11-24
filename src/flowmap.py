"""Generate the placeholder user-flow map (node-and-branch form after reference 13, Siqi / Maxi 3D)
and put it into template.html at <!--FLOWMAP-->. Rerun after changing labels or layout."""
W, H = 130, 26
out = []
DASH = ' stroke-dasharray="3 3"'
TIP = ' marker-end="url(#fm-tip)"'


def node(cx, cy, label, kind='screen', w=W):
    fill, stroke, ink = {'entry': ('none', '#475F7E', '#1A1A1A'), 'area': ('#475F7E', '#475F7E', '#fff'),
                         'screen': ('#cbd6e5', '#809BBC', '#1A1A1A')}[kind]
    weight = 600 if kind == 'area' else 500
    out.append(f'<rect x="{cx - w / 2}" y="{cy - H / 2}" width="{w}" height="{H}" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>'
               f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="11.5" font-weight="{weight}" fill="{ink}">{label}</text>')


def line(pts, dash=False, arrow=False):
    d = 'M' + ' L'.join(f'{x} {y}' for x, y in pts)
    color = '#475F7E' if dash or arrow else '#6f6f6f'
    out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.2"{DASH if dash else ""}{TIP if arrow else ""}/>')


def label(x, y, t):
    out.append(f'<text x="{x}" y="{y}" font-size="10.5" fill="#475F7E" font-weight="600">{t}</text>')


node(500, 20, 'Start', 'entry')
line([(500, 33), (500, 55)])
out.append('<polygon points="500,55 532,76 500,97 468,76" fill="#DCDCE3" stroke="#475F7E" stroke-width="1.2"/>'
           '<text x="500" y="80" text-anchor="middle" font-size="10.5" fill="#1A1A1A">Account?</text>')
line([(500, 97), (500, 119)], arrow=True); label(506, 112, 'yes')
line([(532, 76), (623, 76)], arrow=True); label(556, 70, 'no')
node(690, 76, 'Sign up')
line([(690, 89), (690, 134), (567, 134)], arrow=True)
node(500, 134, 'Home', 'entry')
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
node(500, 400, 'Details'); line([(500, 413), (500, 430)], arrow=True)
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
legend = ('<g transform="translate(20 528)" font-size="10.5" fill="#575B65">'
          '<rect x="0" y="-9" width="22" height="12" rx="3" fill="none" stroke="#475F7E"/><text x="30" y="1">Start</text>'
          '<rect x="100" y="-9" width="22" height="12" rx="3" fill="#475F7E"/><text x="130" y="1">Area</text>'
          '<rect x="195" y="-9" width="22" height="12" rx="3" fill="#cbd6e5" stroke="#809BBC"/><text x="225" y="1">Screen</text>'
          '<polygon points="300,-9 311,-3 300,3 289,-3" fill="none" stroke="#475F7E"/><text x="320" y="1">Decision</text>'
          '<path d="M410 -3 H440" stroke="#475F7E" stroke-dasharray="3 3"/><text x="448" y="1">Cross-link</text></g>')
svg = ('<!--FLOWMAP:start--><svg class="flowmap" viewBox="0 0 1000 545" role="img" font-family="\'Roboto Flex\',Arial,sans-serif" '
       'aria-label="Example user flow: users without an account sign up first. The home screen leads to five areas with screens, lists, and options. Area C leads through the detail and results screens to the end. Dashed lines connect the areas.">'
       '<defs><marker id="fm-tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">'
       '<path d="M1 1 7 4 1 7" fill="none" stroke="#475F7E" stroke-width="1.4"/></marker></defs>'
       + ''.join(out) + legend + '</svg><!--FLOWMAP:end-->')

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
