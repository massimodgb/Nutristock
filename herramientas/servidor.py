"""Servidor local para probar la app en el ordenador: py herramientas/servidor.py
Desactiva la caché para que siempre veas la última versión de los archivos."""
import http.server
import os
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class SinCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


print(f'NutriStock en http://localhost:{PUERTO}')
http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), SinCache).serve_forever()
