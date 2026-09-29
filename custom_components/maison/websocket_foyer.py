"""Commandes WebSocket de la page Configurations (tablette).

Accessibles aux comptes non administrateurs. Affichage et notifications se règlent
sans code ; les membres et le nom du foyer demandent une session ouverte par le code
(le même jeton que le Budget). Réglages système et appairages : sur le PC uniquement.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import CLE_FOYER, DOMAIN
from .foyer import (
    valider_affichage,
    valider_membre,
    valider_modification_membre,
    valider_nom_foyer,
    valider_notifications,
)
from .reglages import FoyerErreur, Reglages

JETON = vol.All(str, vol.Length(max=128))
IDENTIFIANT = vol.All(str, vol.Match(r"^[0-9a-f]{12}$"))


def _reglages(hass: HomeAssistant, connection, msg) -> Reglages | None:
    reglages = hass.data.get(CLE_FOYER)
    if reglages is None:
        connection.send_error(msg["id"], "non_configure", "Intégration Maison non configurée")
    return reglages


def _session_valide(hass: HomeAssistant, connection, msg) -> bool:
    coffre = hass.data.get(DOMAIN)
    if coffre is not None and coffre.sessions.valider(msg["jeton"], connection.user.id):
        return True
    connection.send_error(msg["id"], "session_invalide", "Session expirée : saisir le code")
    return False


async def _executer(connection, msg, valider: Callable[[], Any], action: Callable[[Any], Awaitable[dict]]) -> None:
    try:
        valeur = valider()
    except vol.Invalid as err:
        connection.send_error(msg["id"], "donnees_invalides", str(err))
        return
    try:
        connection.send_result(msg["id"], await action(valeur))
    except FoyerErreur as err:
        connection.send_error(msg["id"], err.code, str(err))


@websocket_api.websocket_command({vol.Required("type"): "maison/foyer/lire"})
@websocket_api.async_response
async def ws_foyer_lire(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], reglages.lire())


# ---- Sans code : ne touche que l'affichage et les rappels ----

@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/affichage",
    vol.Required("affichage"): dict,
})
@websocket_api.async_response
async def ws_foyer_affichage(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None:
        await _executer(connection, msg, lambda: valider_affichage(msg["affichage"]),
                        lambda v: reglages.modifier_reglages("affichage", v))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/notifications",
    vol.Required("notifications"): dict,
})
@websocket_api.async_response
async def ws_foyer_notifications(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None:
        await _executer(connection, msg, lambda: valider_notifications(msg["notifications"]),
                        lambda v: reglages.modifier_reglages("notifications", v))


# ---- Avec le code : membres et nom du foyer ----

@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/nom",
    vol.Required("jeton"): JETON,
    vol.Required("nom"): vol.All(str, vol.Length(max=100)),
})
@websocket_api.async_response
async def ws_foyer_nom(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None and _session_valide(hass, connection, msg):
        await _executer(connection, msg, lambda: valider_nom_foyer(msg["nom"]), reglages.renommer)


@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/membre/ajouter",
    vol.Required("jeton"): JETON,
    vol.Required("membre"): dict,
})
@websocket_api.async_response
async def ws_membre_ajouter(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None and _session_valide(hass, connection, msg):
        await _executer(connection, msg, lambda: valider_membre(msg["membre"]), reglages.ajouter_membre)


@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/membre/modifier",
    vol.Required("jeton"): JETON,
    vol.Required("membre_id"): IDENTIFIANT,
    vol.Required("modification"): dict,
})
@websocket_api.async_response
async def ws_membre_modifier(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None and _session_valide(hass, connection, msg):
        await _executer(connection, msg, lambda: valider_modification_membre(msg["modification"]),
                        lambda v: reglages.modifier_membre(msg["membre_id"], v))


@websocket_api.websocket_command({
    vol.Required("type"): "maison/foyer/membre/retirer",
    vol.Required("jeton"): JETON,
    vol.Required("membre_id"): IDENTIFIANT,
})
@websocket_api.async_response
async def ws_membre_retirer(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (reglages := _reglages(hass, connection, msg)) is not None and _session_valide(hass, connection, msg):
        await _executer(connection, msg, lambda: msg["membre_id"], reglages.retirer_membre)


COMMANDES_FOYER = (
    ws_foyer_lire, ws_foyer_affichage, ws_foyer_notifications,
    ws_foyer_nom, ws_membre_ajouter, ws_membre_modifier, ws_membre_retirer,
)
