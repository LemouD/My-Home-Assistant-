"""Purge du dossier des photos du menu.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
"""

from __future__ import annotations

from pathlib import Path

from .menu import FORMAT_ID_PHOTO


def purger_dossier(dossier: Path, gardes: set[str], plafond: int) -> None:
    """Supprime les photos inutilisées, puis les plus anciennes au-delà de `plafond` octets.

    Seuls les fichiers au format de l'intégration (<16 hexa>.webp), directement dans
    `dossier` et qui ne sont pas des liens, sont concernés : rien d'autre n'est jamais supprimé.
    """
    if not dossier.is_dir() or dossier.is_symlink():
        return
    fichiers = [f for f in dossier.iterdir()
                if f.suffix == ".webp" and FORMAT_ID_PHOTO.fullmatch(f.stem) and f.is_file() and not f.is_symlink()]
    for fichier in fichiers:
        if fichier.stem not in gardes:
            fichier.unlink(missing_ok=True)
    restants = sorted((f for f in fichiers if f.exists()), key=lambda f: f.stat().st_mtime)
    total = sum(f.stat().st_size for f in restants)
    while restants and total > plafond:
        plus_ancien = restants.pop(0)
        total -= plus_ancien.stat().st_size
        plus_ancien.unlink(missing_ok=True)
