"""Photos des recettes : téléchargées depuis Pexels par le serveur, réencodées, servies par HA.

La tablette ne contacte jamais Pexels : elle reçoit une URL signée vers la vue ci-dessous,
valable SIGNATURE_PHOTO_HEURES, et recalculée à chaque lecture du menu ou du catalogue.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
from datetime import timedelta
from pathlib import Path

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    PHOTO_COTE_MAX,
    PHOTO_PIXELS_MAX,
    PHOTO_POIDS_CIBLE,
    PHOTO_TELECHARGEMENT_MAX,
    PHOTOS_DISQUE_MAX,
    SIGNATURE_PHOTO_HEURES,
)
from .menu import FORMAT_ID_PHOTO, type_image, url_image_autorisee

_LOGGER = logging.getLogger(__name__)

CHEMIN_VUE = "/api/maison/photo/"


def dossier_photos(hass: HomeAssistant) -> Path:
    # Hors de /config/www : jamais servi sans authentification
    return Path(hass.config.path("maison", "photos"))


def url_signee(hass: HomeAssistant, identifiant: str) -> str:
    """À appeler pendant une commande WebSocket : signée pour l'utilisateur connecté."""
    return async_sign_path(hass, f"{CHEMIN_VUE}{identifiant}.webp", timedelta(hours=SIGNATURE_PHOTO_HEURES))


def _reencoder(contenu: bytes) -> bytes:
    """Décodage puis réencodage WebP : retire les métadonnées et neutralise un fichier piégé."""
    from PIL import Image  # fourni avec Home Assistant ; importé ici pour les tests sans HA

    with Image.open(io.BytesIO(contenu)) as image:
        largeur, hauteur = image.size
        if largeur * hauteur > PHOTO_PIXELS_MAX:
            raise ValueError("image trop grande")
        image = image.convert("RGB")
        image.thumbnail((PHOTO_COTE_MAX, PHOTO_COTE_MAX))
        for qualite in (75, 60, 45):
            sortie = io.BytesIO()
            image.save(sortie, "WEBP", quality=qualite, method=4)
            if sortie.tell() <= PHOTO_POIDS_CIBLE:
                break
        return sortie.getvalue()


def _ecrire(dossier: Path, nom: str, contenu: bytes) -> None:
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / nom).write_bytes(contenu)


def _purger(dossier: Path, gardes: set[str]) -> None:
    """Supprime les photos inutilisées, puis les plus anciennes au-delà du plafond disque.

    Seuls les fichiers au format de l'intégration (<16 hexa>.webp), directement dans
    notre dossier, sont concernés : rien d'autre n'est jamais supprimé.
    """
    if not dossier.is_dir():
        return
    fichiers = [f for f in dossier.iterdir()
                if f.is_file() and not f.is_symlink() and f.suffix == ".webp" and FORMAT_ID_PHOTO.fullmatch(f.stem)]
    for fichier in fichiers:
        if fichier.stem not in gardes:
            fichier.unlink(missing_ok=True)
    restants = sorted((f for f in fichiers if f.exists()), key=lambda f: f.stat().st_mtime)
    total = sum(f.stat().st_size for f in restants)
    while restants and total > PHOTOS_DISQUE_MAX:
        plus_ancien = restants.pop(0)
        total -= plus_ancien.stat().st_size
        plus_ancien.unlink(missing_ok=True)


class Photos:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.dossier = dossier_photos(hass)

    async def telecharger(self, url: str) -> str | None:
        """Identifiant de la photo enregistrée, ou None (un échec ne bloque jamais une recette)."""
        if not url_image_autorisee(url):
            _LOGGER.warning("Menu : photo refusée (origine non autorisée)")
            return None
        try:
            async with async_get_clientsession(self.hass).get(
                url, timeout=aiohttp.ClientTimeout(total=20), allow_redirects=False,
            ) as reponse:
                if reponse.status != 200 or reponse.content_type not in ("image/jpeg", "image/png", "image/webp"):
                    return None
                contenu = await reponse.content.read(PHOTO_TELECHARGEMENT_MAX + 1)
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return None
        if len(contenu) > PHOTO_TELECHARGEMENT_MAX or type_image(contenu[:16]) is None:
            return None
        try:
            webp = await self.hass.async_add_executor_job(_reencoder, contenu)
        except Exception:  # noqa: BLE001 — toute image illisible est simplement ignorée
            _LOGGER.warning("Menu : photo illisible ignorée")
            return None
        identifiant = hashlib.sha256(webp).hexdigest()[:16]
        await self.hass.async_add_executor_job(_ecrire, self.dossier, f"{identifiant}.webp", webp)
        return identifiant

    async def purger(self, gardes: set[str]) -> None:
        await self.hass.async_add_executor_job(_purger, self.dossier, gardes)


class VuePhoto(HomeAssistantView):
    """Photo d'une recette : session HA ou URL signée obligatoire."""

    url = CHEMIN_VUE + "{nom}"
    name = "api:maison:photo"
    requires_auth = True

    def __init__(self, dossier: Path) -> None:
        self._dossier = dossier

    async def get(self, request: web.Request, nom: str) -> web.StreamResponse:
        # Nom strictement contrôlé : aucun chemin arbitraire (../) ne peut être lu
        identifiant, _, extension = nom.partition(".")
        if extension != "webp" or not FORMAT_ID_PHOTO.fullmatch(identifiant):
            return web.Response(status=404)
        fichier = self._dossier / f"{identifiant}.webp"
        if not fichier.is_file():
            return web.Response(status=404)
        return web.FileResponse(fichier, headers={
            "Content-Type": "image/webp",
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        })
