"""Commandes WebSocket du menu, appelées par le panneau via hass.callWS.

Accessibles aux comptes non administrateurs (tablette), sans code : pas de donnée sensible.
Le panneau n'appelle jamais le générateur lui-même : tout passe par ces commandes,
qui appliquent le quota, les listes fermées et le filtre halal / allergies.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import CLE_CUISINE, REPAS
from .cuisine import Cuisine, MenuErreur
from .menu import valider_parametres

DATE = vol.All(str, vol.Match(r"^\d{4}-\d{2}-\d{2}$"))
IDENTIFIANT = vol.All(str, vol.Length(max=32))


def _cuisine(hass: HomeAssistant, connection, msg) -> Cuisine | None:
    cuisine = hass.data.get(CLE_CUISINE)
    if cuisine is None:
        connection.send_error(msg["id"], "non_configure", "Intégration Maison non configurée")
    return cuisine


async def _executer(connection, msg, action) -> None:
    try:
        connection.send_result(msg["id"], await action())
    except MenuErreur as err:
        connection.send_error(msg["id"], err.code, str(err))


@websocket_api.websocket_command({vol.Required("type"): "maison/menu/etat"})
@websocket_api.async_response
async def ws_menu_etat(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (cuisine := _cuisine(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], cuisine.etat())


@websocket_api.websocket_command({
    vol.Required("type"): "maison/menu/generer",
    vol.Required("parametres"): dict,
})
@websocket_api.async_response
async def ws_menu_generer(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (cuisine := _cuisine(hass, connection, msg)) is None:
        return
    try:
        parametres = valider_parametres(msg["parametres"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "parametres_invalides", str(err))
        return
    await _executer(connection, msg, lambda: cuisine.generer(parametres))


@websocket_api.websocket_command({vol.Required("type"): "maison/menu/lire"})
@websocket_api.async_response
async def ws_menu_lire(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (cuisine := _cuisine(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], cuisine.lire())


@websocket_api.websocket_command({
    vol.Required("type"): "maison/menu/remplacer",
    vol.Required("date"): DATE,
    vol.Required("repas"): vol.In(REPAS),
})
@websocket_api.async_response
async def ws_menu_remplacer(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (cuisine := _cuisine(hass, connection, msg)) is not None:
        await _executer(connection, msg, lambda: cuisine.remplacer(msg["date"], msg["repas"]))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/menu/vers_courses",
    vol.Optional("recettes"): vol.All([IDENTIFIANT], vol.Length(max=64)),
})
@websocket_api.async_response
async def ws_menu_vers_courses(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (cuisine := _cuisine(hass, connection, msg)) is not None:
        await _executer(connection, msg, lambda: cuisine.vers_courses(msg.get("recettes")))


COMMANDES_MENU = (ws_menu_etat, ws_menu_generer, ws_menu_lire, ws_menu_remplacer, ws_menu_vers_courses)
