"""Pull only the CSS rules that style given classes out of a page's <style> blocks.

Keeps a top-level rule when one of its selectors names a wanted class, keeps @media/@supports
wrappers around such rules, and keeps @keyframes the kept rules animate. Comments are dropped.
"""
import re

def _statements(css):
    i, n = 0, len(css)
    while i < n:
        while i < n and css[i] in " \t\r\n;": i += 1
        if i >= n: break
        j = css.find("{", i)
        if j < 0: break
        head = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
        yield head, css[j + 1:k - 1]
        i = k

def extract(html, classes, drop=()):
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    want = re.compile(r"\.(%s)(?![\w-])" % "|".join(map(re.escape, classes)))
    unwanted = re.compile(r"\.(%s)(?![\w-])" % "|".join(map(re.escape, drop))) if drop else None
    keyframes = dict()
    out, anims = [], set()
    def walk(text, wrap=None):
        for head, body in _statements(text):
            if head.startswith("@keyframes"):
                keyframes[head.split()[1]] = f"{head}{{{body}}}"
            elif head.startswith(("@media", "@supports", "@container")):
                inner = walk_collect(body)
                if inner: out.append(f"{head}{{{inner}}}")
            elif not head.startswith("@"):
                sels = [s for s in head.split(",") if want.search(s) and not (unwanted and unwanted.search(s))]
                if sels:
                    out.append(f"{','.join(s.strip() for s in sels)}{{{body.strip()}}}")
                    anims.update(re.findall(r"animation(?:-name)?\s*:\s*([\w-]+)", body))
    def walk_collect(text):
        before = len(out); walk(text); got = out[before:]; del out[before:]
        return "".join(got)
    walk(css)
    out += [keyframes[a] for a in sorted(anims) if a in keyframes]
    return "\n".join(out)
