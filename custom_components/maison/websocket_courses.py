"""Commandes WebSocket des dernières courses et du comparateur.

Accessibles aux comptes non administrateurs (tablette). Les prix et le comparateur sont
lisibles sans code ; le total payé d'un passage n'est renvoyé qu'avec un jeton Budget valide.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .carnet import Carnet
from .const import CLE_CARNET, DOMAIN

JETON = vol.All(str, vol.Length(max=128))


def _carnet(hass: HomeAssistant, connection, msg) -> Carnet | None:
    carnet = hass.data.get(CLE_CARNET)
    if carnet is None:
        connection.send_error(msg["id"], "non_configure", "Intégration Maison non configurée")
    return carnet


@websocket_api.websocket_command({vol.Required("type"): "maison/courses/magasins"})
@websocket_api.async_response
async def ws_courses_magasins(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (carnet := _carnet(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], carnet.magasins())


@websocket_api.websocket_command({
    vol.Required("type"): "maison/courses/passage/ajouter",
    vol.Required("passage"): dict,
})
@websocket_api.async_response
async def ws_courses_ajouter(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (carnet := _carnet(hass, connection, msg)) is None:
        return
    try:
        connection.send_result(msg["id"], await carnet.ajouter(msg["passage"]))
    except vol.Invalid as err:
        connection.send_error(msg["id"], "passage_invalide", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/courses/historique",
    vol.Optional("limite", default=10): vol.All(int, vol.Range(min=1, max=50)),
    vol.Optional("jeton"): JETON,
})
@websocket_api.async_response
async def ws_courses_historique(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (carnet := _carnet(hass, connection, msg)) is None:
        return
    # Jeton absent ou invalide : historique sans les montants (pas d'erreur)
    coffre = hass.data.get(DOMAIN)
    avec_totaux = bool(msg.get("jeton") and coffre and coffre.sessions.valider(msg["jeton"], connection.user.id))
    connection.send_result(msg["id"], carnet.historique(msg["limite"], avec_totaux))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/courses/prix",
    vol.Required("magasin"): vol.All(str, vol.Length(max=40)),
    vol.Required("noms"): vol.All([vol.All(str, vol.Length(max=60))], vol.Length(max=150)),
})
@websocket_api.async_response
async def ws_courses_prix(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (carnet := _carnet(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], carnet.prix(msg["magasin"], msg["noms"]))


@websocket_api.websocket_command({vol.Required("type"): "maison/courses/comparer"})
@websocket_api.async_response
async def ws_courses_comparer(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (carnet := _carnet(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], carnet.comparer())


COMMANDES_COURSES = (
    ws_courses_magasins, ws_courses_ajouter, ws_courses_historique, ws_courses_prix, ws_courses_comparer,
)
