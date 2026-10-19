"""Local static server with caching disabled (for development)."""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        # dev-only: lets tools/lab/fbxdump.html save converted FBX data
        name = os.path.basename(self.path)
        if not self.path.startswith("/tools/lab/out/") or not name.endswith(".json"):
            self.send_error(403)
            return
        data = self.rfile.read(int(self.headers["Content-Length"]))
        os.makedirs("tools/lab/out", exist_ok=True)
        with open(os.path.join("tools/lab/out", name), "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
