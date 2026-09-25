"""Intégration Maison : budget protégé par un code, servi au panneau en WebSocket.

Les données du budget ne passent jamais par hass.states : elles ne sont lisibles
qu'avec un jeton obtenu en saisissant le code.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .coffre import Coffre
from .const import DOMAIN
from .websocket import async_enregistrer_commandes

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    # Commandes enregistrées une seule fois ; elles répondent "non_configure" sans entrée
    async_enregistrer_commandes(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entree: ConfigEntry) -> bool:
    coffre = Coffre(hass, entree)
    await coffre.charger()
    hass.data[DOMAIN] = coffre
    entree.async_on_unload(entree.add_update_listener(_code_modifie))
    return True


async def async_unload_entry(hass: HomeAssistant, entree: ConfigEntry) -> bool:
    coffre: Coffre | None = hass.data.pop(DOMAIN, None)
    if coffre is not None:
        coffre.sessions.fermer_tout()
    return True


async def _code_modifie(hass: HomeAssistant, entree: ConfigEntry) -> None:
    """Changement de code : toutes les sessions ouvertes avec l'ancien code sont fermées."""
    coffre: Coffre | None = hass.data.get(DOMAIN)
    if coffre is not None:
        coffre.sessions.fermer_tout()
