# Serveur de développement : sert le dossier smarthome/ sans cache navigateur,
# pour que chaque rechargement prenne la dernière version des modules JS.
# Usage (depuis la racine du repo) : python smarthome/dev/serveur.py [port]

import functools
import http.server
import pathlib
import re
import sys


# Photos du menu simulées : /api/maison/photo/<16 hexa>.webp renvoie une image libre du repo
# (assets/images/vie/), choisie d'après le nom. En production, c'est l'intégration « maison » qui sert.
PHOTOS_DEMO = sorted((pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'images' / 'vie').glob('*.webp'))
PHOTO = re.compile(r'^/api/maison/photo/([0-9a-f]{16})\.webp(\?.*)?$')


class SansCache(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        trouve = PHOTO.match(path)
        if trouve and PHOTOS_DEMO:
            return str(PHOTOS_DEMO[int(trouve.group(1), 16) % len(PHOTOS_DEMO)])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
dossier = pathlib.Path(__file__).resolve().parent.parent
gestionnaire = functools.partial(SansCache, directory=str(dossier))

print(f'Aperçu : http://localhost:{port}/dev/')
http.server.ThreadingHTTPServer(('localhost', port), gestionnaire).serve_forever()
