"""Commandes WebSocket du budget, appelées par le panneau via hass.callWS.

Accessibles aux comptes non administrateurs (tablette) : l'accès aux données
est protégé par le code, pas par le rôle HA.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .coffre import Coffre, CodeRefuse
from .const import DOMAIN
from .schema import valider_budget

JETON = vol.All(str, vol.Length(max=128))


def async_enregistrer_commandes(hass: HomeAssistant) -> None:
    for commande in (ws_etat, ws_deverrouiller, ws_lire, ws_enregistrer, ws_verrouiller):
        websocket_api.async_register_command(hass, commande)


def _coffre(hass: HomeAssistant, connection, msg) -> Coffre | None:
    coffre = hass.data.get(DOMAIN)
    if coffre is None:
        connection.send_error(msg["id"], "non_configure", "Code du budget non configuré")
    return coffre


def _session_valide(coffre: Coffre, connection, msg) -> bool:
    if coffre.sessions.valider(msg["jeton"], connection.user.id):
        return True
    connection.send_error(msg["id"], "session_invalide", "Session expirée : saisir le code")
    return False


@websocket_api.websocket_command({vol.Required("type"): "maison/budget/etat"})
@websocket_api.async_response
async def ws_etat(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    coffre = hass.data.get(DOMAIN)
    connection.send_result(msg["id"], {
        "configure": coffre is not None,
        "attente": coffre.verrou.attente() if coffre else 0,
        "essaisRestants": coffre.verrou.essais_restants() if coffre else 0,
    })


@websocket_api.websocket_command({
    vol.Required("type"): "maison/budget/deverrouiller",
    vol.Required("code"): vol.All(str, vol.Length(max=32)),
})
@websocket_api.async_response
async def ws_deverrouiller(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (coffre := _coffre(hass, connection, msg)) is None:
        return
    try:
        jeton = await coffre.deverrouiller(msg["code"], connection.user.id, connection.user.name)
    except CodeRefuse as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], {"jeton": jeton, "duree": coffre.sessions.duree})


@websocket_api.websocket_command({
    vol.Required("type"): "maison/budget/lire",
    vol.Required("jeton"): JETON,
})
@websocket_api.async_response
async def ws_lire(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (coffre := _coffre(hass, connection, msg)) is None or not _session_valide(coffre, connection, msg):
        return
    connection.send_result(msg["id"], await coffre.lire())


@websocket_api.websocket_command({
    vol.Required("type"): "maison/budget/enregistrer",
    vol.Required("jeton"): JETON,
    vol.Required("donnees"): dict,
})
@websocket_api.async_response
async def ws_enregistrer(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (coffre := _coffre(hass, connection, msg)) is None or not _session_valide(coffre, connection, msg):
        return
    try:
        modifications = valider_budget(msg["donnees"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "donnees_invalides", str(err))
        return
    connection.send_result(msg["id"], await coffre.enregistrer(modifications))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/budget/verrouiller",
    vol.Required("jeton"): JETON,
})
@websocket_api.async_response
async def ws_verrouiller(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (coffre := hass.data.get(DOMAIN)) is not None:
        coffre.sessions.fermer(msg["jeton"])
    connection.send_result(msg["id"], {})
