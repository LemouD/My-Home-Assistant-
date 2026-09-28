"""Intégration Maison : budget protégé par un code et menu généré, servis au panneau en WebSocket.

Les données du budget ne passent jamais par hass.states : elles ne sont lisibles
qu'avec un jeton obtenu en saisissant le code.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .carnet import Carnet
from .coffre import Coffre
from .const import CLE_CARNET, CLE_CUISINE, DOMAIN
from .cuisine import Cuisine
from .photos import VuePhoto, dossier_photos
from .websocket import async_enregistrer_commandes

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    # Commandes enregistrées une seule fois ; elles répondent "non_configure" sans entrée
    async_enregistrer_commandes(hass)
    hass.http.register_view(VuePhoto(dossier_photos(hass)))
    return True


async def async_setup_entry(hass: HomeAssistant, entree: ConfigEntry) -> bool:
    coffre = Coffre(hass, entree)
    await coffre.charger()
    cuisine = Cuisine(hass, entree)
    await cuisine.charger()
    hass.data[DOMAIN] = coffre
    hass.data[CLE_CUISINE] = cuisine
    carnet = Carnet(hass, entree)
    await carnet.charger()
    hass.data[CLE_CARNET] = carnet
    entree.async_on_unload(entree.add_update_listener(_configuration_modifiee))
    return True


async def async_unload_entry(hass: HomeAssistant, entree: ConfigEntry) -> bool:
    coffre: Coffre | None = hass.data.pop(DOMAIN, None)
    hass.data.pop(CLE_CUISINE, None)
    hass.data.pop(CLE_CARNET, None)
    if coffre is not None:
        coffre.sessions.fermer_tout()
    return True


async def _configuration_modifiee(hass: HomeAssistant, entree: ConfigEntry) -> None:
    """Changement de code : toutes les sessions ouvertes avec l'ancien code sont fermées.

    Les réglages du menu (options) ne touchent pas aux sessions du budget.
    """
    coffre: Coffre | None = hass.data.get(DOMAIN)
    if coffre is None:
        return
    empreinte = entree.data["code"]["empreinte"]
    if empreinte != coffre.empreinte_active:
        coffre.empreinte_active = empreinte
        coffre.sessions.fermer_tout()
