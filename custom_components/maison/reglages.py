"""Stockage des réglages du foyer (membres, affichage, notifications)."""

from __future__ import annotations

import asyncio
import secrets

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STOCKAGE_FOYER_CLE, STOCKAGE_FOYER_VERSION
from .foyer import MEMBRES_MAX, completer, prenom_pris


class FoyerErreur(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Reglages:
    def __init__(self, hass: HomeAssistant, entree: ConfigEntry) -> None:
        self.hass = hass
        self.entree = entree
        # private=True : fichier .storage lisible par le seul utilisateur système de HA
        self._stockage = Store(hass, STOCKAGE_FOYER_VERSION, STOCKAGE_FOYER_CLE, private=True)
        self._etat = completer(None)
        self._verrou = asyncio.Lock()

    async def charger(self) -> None:
        self._etat = completer(await self._stockage.async_load())

    def lire(self) -> dict:
        return {
            "nom": self._etat["nom"],
            "membres": [dict(m) for m in self._etat["membres"]],
            "membresMax": MEMBRES_MAX,
            "affichage": dict(self._etat["affichage"]),
            "notifications": dict(self._etat["notifications"]),
        }

    async def _sauver(self) -> dict:
        await self._stockage.async_save(self._etat)
        return self.lire()

    async def modifier_reglages(self, cle: str, valeurs: dict) -> dict:
        async with self._verrou:
            self._etat[cle].update(valeurs)
            return await self._sauver()

    async def renommer(self, nom: str) -> dict:
        async with self._verrou:
            self._etat["nom"] = nom
            return await self._sauver()

    async def ajouter_membre(self, membre: dict) -> dict:
        async with self._verrou:
            membres = self._etat["membres"]
            if len(membres) >= MEMBRES_MAX:
                raise FoyerErreur("membres_max", f"{MEMBRES_MAX} membres au plus")
            if prenom_pris(membres, membre["prenom"]):
                raise FoyerErreur("prenom_pris", "Ce prénom est déjà utilisé")
            membres.append({"id": secrets.token_hex(6), **membre})
            return await self._sauver()

    def _membre(self, ident: str) -> dict:
        for m in self._etat["membres"]:
            if m["id"] == ident:
                return m
        raise FoyerErreur("membre_absent", "Membre introuvable")

    async def modifier_membre(self, ident: str, modification: dict) -> dict:
        async with self._verrou:
            membre = self._membre(ident)
            if "prenom" in modification and prenom_pris(self._etat["membres"], modification["prenom"], sauf=ident):
                raise FoyerErreur("prenom_pris", "Ce prénom est déjà utilisé")
            membre.update(modification)
            return await self._sauver()

    async def retirer_membre(self, ident: str) -> dict:
        async with self._verrou:
            membre = self._membre(ident)
            self._etat["membres"].remove(membre)
            return await self._sauver()
