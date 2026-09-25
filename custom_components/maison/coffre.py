"""État de l'intégration : stockage du budget, verrou anti force brute et sessions."""

from __future__ import annotations

import asyncio
import logging

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import budget
from .const import (
    STOCKAGE_CLE,
    STOCKAGE_VERROU_CLE,
    STOCKAGE_VERROU_VERSION,
    STOCKAGE_VERSION,
)
from .securite import Sessions, Verrou, verifier_code

_LOGGER = logging.getLogger(__name__)

NOTIFICATION_ID = "maison_budget_bloque"


class CodeRefuse(Exception):
    """Code faux ou essais bloqués ; `code` est le code d'erreur WebSocket."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Coffre:
    def __init__(self, hass: HomeAssistant, entree: ConfigEntry) -> None:
        self.hass = hass
        self.entree = entree
        self.sessions = Sessions()
        self.verrou = Verrou()
        # private=True : fichiers .storage lisibles par le seul utilisateur système de HA
        self._stockage = Store(hass, STOCKAGE_VERSION, STOCKAGE_CLE, private=True)
        self._stockage_verrou = Store(hass, STOCKAGE_VERROU_VERSION, STOCKAGE_VERROU_CLE, private=True)
        # Une seule vérification de code à la fois : sans ce verrou, des essais envoyés
        # en parallèle passeraient tous le contrôle avant que le premier échec soit compté
        self._verif = asyncio.Lock()
        # Lectures / écritures du budget sérialisées (clôture mensuelle + enregistrement)
        self._donnees = asyncio.Lock()

    async def charger(self) -> None:
        self.verrou.restaurer(await self._stockage_verrou.async_load())

    # ---- CODE ----

    async def deverrouiller(self, code: str, utilisateur_id: str, utilisateur_nom: str) -> str:
        async with self._verif:
            attente = self.verrou.attente()
            if attente:
                raise CodeRefuse("bloque", f"Trop d'essais : réessayer dans {attente} s")

            ok = await self.hass.async_add_executor_job(
                verifier_code, code, self.entree.data["code"]
            )
            if not ok:
                bloque = self.verrou.echec()
                await self._stockage_verrou.async_save(self.verrou.exporter())
                _LOGGER.warning("Budget : code erroné saisi par %s", utilisateur_nom)
                if bloque:
                    self._notifier_blocage(utilisateur_nom)
                    raise CodeRefuse("bloque", f"Trop d'essais : réessayer dans {self.verrou.attente()} s")
                raise CodeRefuse("code_invalide", "Code incorrect")

            self.verrou.succes()
            await self._stockage_verrou.async_save(self.verrou.exporter())
            _LOGGER.info("Budget : déverrouillé par %s", utilisateur_nom)
            return self.sessions.ouvrir(utilisateur_id)

    def _notifier_blocage(self, utilisateur_nom: str) -> None:
        persistent_notification.async_create(
            self.hass,
            f"Plusieurs codes erronés pour le budget (dernier essai : {utilisateur_nom}). "
            f"Saisie bloquée {self.verrou.attente()} s.",
            title="Maison : accès au budget bloqué",
            notification_id=NOTIFICATION_ID,
        )

    # ---- DONNÉES ----

    async def _charger_mois_courant(self) -> dict:
        """Données du mois courant ; clôture le mois écoulé si nécessaire."""
        mois = dt_util.now().strftime("%Y-%m")
        stockees = await self._stockage.async_load()
        donnees = stockees if stockees is not None else budget.donnees_vides(mois)
        donnees, cloture = budget.cloturer_si_necessaire(donnees, mois)
        if cloture or stockees is None:
            await self._stockage.async_save(donnees)
        return donnees

    async def lire(self) -> dict:
        async with self._donnees:
            return await self._charger_mois_courant()

    async def enregistrer(self, modifications: dict) -> dict:
        async with self._donnees:
            donnees = budget.appliquer_modifications(await self._charger_mois_courant(), modifications)
            await self._stockage.async_save(donnees)
            return donnees
