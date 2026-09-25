"""Configuration du code d'accès au budget (réservée aux administrateurs HA)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType

from .const import DOMAIN
from .securite import code_faible, code_valide, hacher_code

CHAMP_CODE = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))

SCHEMA_CODE = vol.Schema({
    vol.Required("code"): CHAMP_CODE,
    vol.Required("confirmation"): CHAMP_CODE,
})


def _erreurs_code(saisie: dict[str, Any]) -> dict[str, str]:
    code = saisie["code"]
    if not code_valide(code):
        return {"code": "code_invalide"}
    if code_faible(code):
        return {"code": "code_faible"}
    if saisie["confirmation"] != code:
        return {"confirmation": "codes_differents"}
    return {}


class MaisonConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        erreurs: dict[str, str] = {}
        if saisie is not None:
            erreurs = _erreurs_code(saisie)
            if not erreurs:
                # Seule l'empreinte est enregistrée dans la configuration
                empreinte = await self.hass.async_add_executor_job(hacher_code, saisie["code"])
                return self.async_create_entry(title="Maison", data={"code": empreinte})

        return self.async_show_form(step_id="user", data_schema=SCHEMA_CODE, errors=erreurs)

    @staticmethod
    @callback
    def async_get_options_flow(entree: ConfigEntry) -> OptionsFlow:
        return MaisonOptionsFlow()


class MaisonOptionsFlow(OptionsFlow):
    """Changement du code ; les sessions ouvertes sont fermées (voir __init__._code_modifie)."""

    async def async_step_init(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        erreurs: dict[str, str] = {}
        if saisie is not None:
            erreurs = _erreurs_code(saisie)
            if not erreurs:
                empreinte = await self.hass.async_add_executor_job(hacher_code, saisie["code"])
                self.hass.config_entries.async_update_entry(
                    self.config_entry, data={**self.config_entry.data, "code": empreinte}
                )
                return self.async_create_entry(data={})

        return self.async_show_form(step_id="init", data_schema=SCHEMA_CODE, errors=erreurs)
