# Serveur de développement : sert le dossier smarthome/ sans cache navigateur,
# pour que chaque rechargement prenne la dernière version des modules JS.
# Usage (depuis la racine du repo) : python smarthome/dev/serveur.py [port]

import functools
import http.server
import pathlib
import sys


class SansCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
dossier = pathlib.Path(__file__).resolve().parent.parent
gestionnaire = functools.partial(SansCache, directory=str(dossier))

print(f'Aperçu : http://localhost:{port}/dev/')
http.server.ThreadingHTTPServer(('localhost', port), gestionnaire).serve_forever()
