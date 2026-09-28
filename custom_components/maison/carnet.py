"""Carnet des dernières courses : stockage des passages en caisse et comparateur de magasins."""

from __future__ import annotations

import asyncio
import secrets

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import STOCKAGE_COURSES_CLE, STOCKAGE_COURSES_VERSION
from .courses import (
    MAGASIN_AUTRE,
    avec_autre,
    comparer,
    conserver,
    derniers_prix,
    lire_magasins,
    preparer_passage,
    valider_passage,
)


class Carnet:
    def __init__(self, hass: HomeAssistant, entree: ConfigEntry) -> None:
        self.hass = hass
        self.entree = entree
        # private=True : fichier .storage lisible par le seul utilisateur système de HA
        self._stockage = Store(hass, STOCKAGE_COURSES_VERSION, STOCKAGE_COURSES_CLE, private=True)
        self._passages: list[dict] = []
        self._verrou = asyncio.Lock()

    async def charger(self) -> None:
        if stockees := await self._stockage.async_load():
            self._passages = stockees.get("passages", [])

    def magasins(self) -> list[dict]:
        """Magasins définis par l'admin dans les options, plus « Autre »."""
        return avec_autre(lire_magasins(self.entree.options.get("courses", {}).get("magasins", "")))

    def _noms(self) -> dict[str, str]:
        return {m["id"]: m["nom"] for m in self.magasins()}

    async def ajouter(self, passage: object) -> dict:
        """Lève vol.Invalid si le passage n'est pas conforme."""
        aujourdhui = dt_util.now().date()
        valide = valider_passage(passage, list(self._noms()), aujourdhui)
        async with self._verrou:
            nouveau = preparer_passage(valide, secrets.token_hex(6))
            self._passages = conserver([nouveau, *self._passages], aujourdhui)
            await self._stockage.async_save({"passages": self._passages})
        return {"id": nouveau["id"], "articles": len(nouveau["articles"])}

    def historique(self, limite: int, avec_totaux: bool) -> list[dict]:
        """Derniers passages ; le total payé n'est inclus qu'avec une session Budget ouverte."""
        noms = self._noms()
        resultat = []
        for p in self._passages[:limite]:
            element = {
                "id": p["id"],
                "magasin": p["magasin"],
                "nom_magasin": noms.get(p["magasin"], "Magasin retiré"),
                "date": p["date"],
                "articles": len(p["articles"]),
            }
            if avec_totaux:
                element["total"] = p.get("total")
            resultat.append(element)
        return resultat

    def prix(self, magasin: str, noms: list[str]) -> dict:
        return derniers_prix(self._passages, magasin, noms)

    def comparer(self) -> dict:
        resultat = comparer(self._passages, dt_util.now().date())
        noms = self._noms()
        for m in resultat["magasins"]:
            m["nom"] = noms.get(m["id"], "Magasin retiré")
        return resultat


__all__ = ["Carnet", "MAGASIN_AUTRE"]
