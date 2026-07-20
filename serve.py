#!/usr/bin/env python3
# 开发用静态服务器：响应带 Cache-Control: no-store，
# 避免浏览器缓存旧的 JS/CSS 导致改代码后页面不更新。
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'天文冰期可视化： http://localhost:{port}')
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
