"""Loopback-only preview and PNG renderer for Case Studyer UI Lab."""
import json
import os
import re
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent / 'Entwürfe'
PAGE = 'Case-Studyer-UI-Elemente.html'
WIREFLOW_IDS = {'flow', 'flow-reschedule', 'flow-live', 'flow-spotify', 'flow-findmy', 'flow-passwords'}
EXAMPLE_PAGES = {**dict.fromkeys(WIREFLOW_IDS, 'Case-Studyer-Wireframes.html'),
                 'agent-images': 'Case-Studyer-Bildgenerierung.html'}
ORIGIN = 'http://127.0.0.1:8765'
RENDER = threading.BoundedSemaphore(1)


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_host(self):
        return self.headers.get('Host') in ('127.0.0.1:8765', 'localhost:8765')

    def do_GET(self):
        if not self.allowed_host():
            return self.send_error(403)
        return super().do_GET()

    def do_POST(self):
        if self.path != '/__section_png':
            return self.send_error(404)
        if (not self.allowed_host() or self.headers.get('Origin') != 'http://' + self.headers['Host']
                or self.headers.get_content_type() != 'application/json'):
            return self.send_error(403)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 1024:
                raise ValueError
            req = json.loads(self.rfile.read(size))
            id_ = req['id']
            width, height = req['width'], req['height']
            page = EXAMPLE_PAGES.get(id_, PAGE)
            if (not re.fullmatch(r'[a-z][a-z0-9-]{0,40}', id_) or
                    not re.search(r'<section class="chapter" id="' + re.escape(id_) + r'"', (ROOT / page).read_text()) or
                    type(width) is not int or not 280 <= width <= 4096 or
                    type(height) is not int or not 240 <= height <= 4096):
                raise ValueError
        except (KeyError, TypeError, ValueError, UnicodeError):
            return self.send_error(400)
        if not RENDER.acquire(blocking=False):
            return self.send_error(429)
        try:
            with tempfile.TemporaryDirectory(prefix='cs-section-') as tmp:
                out = Path(tmp) / 'capture'
                state = {key: req.get(key) for key in ('tab', 'split', 'macbook')}
                wireflow = id_ in WIREFLOW_IDS
                if wireflow:
                    # Mobile may scroll individual flows horizontally; export the whole desktop strip.
                    width = max(1440, width)
                state['height'] = height
                state['dir'] = tmp
                env = {**os.environ, 'CS_SECTION_CAPTURE': json.dumps(state)}
                subprocess.run(['node', str(HERE / 'shoot.mjs'), f'{ORIGIN}/{page}?section-capture=1',
                                str(width), '1' if not wireflow and req.get('touch') is True else '0', str(out), '#' + id_],
                               cwd=HERE, env=env, check=True, timeout=18, capture_output=True)
                image = out.with_suffix('.png').read_bytes()
        except (subprocess.SubprocessError, OSError) as exc:
            self.log_error('Capture failed: %s %s', exc, getattr(exc, 'stderr', b''))
            return self.send_error(500, 'PNG rendering failed')
        finally:
            RENDER.release()
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Content-Length', str(len(image)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(image)


if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1', 8765), Preview) as server:
        server.serve_forever()
