"""Local dev server without caching: python3 tools/serve.py [port]"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
root = Path(__file__).resolve().parent.parent
print(f'http://localhost:{port}')
ThreadingHTTPServer(('', port), partial(NoCache, directory=root)).serve_forever()
