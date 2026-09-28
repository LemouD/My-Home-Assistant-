"""Configuration de l'intégration (réservée aux administrateurs HA) : code du budget, générateur du menu."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import DOMAIN, QUOTA_MENU_DEFAUT, REPAS, REPAS_DEFAUT
from .courses import lire_magasins
from .menu import url_generateur_valide
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
    """Réglages : changement du code, et générateur du menu."""

    async def async_step_init(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["code", "menu", "courses"])

    def _enregistrer(self, **modifs: Any) -> ConfigFlowResult:
        # Les autres réglages sont conservés : async_create_entry remplace toutes les options
        return self.async_create_entry(data={**self.config_entry.options, **modifs})

    async def async_step_code(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Changement du code ; les sessions ouvertes sont fermées (voir __init__)."""
        erreurs: dict[str, str] = {}
        if saisie is not None:
            erreurs = _erreurs_code(saisie)
            if not erreurs:
                empreinte = await self.hass.async_add_executor_job(hacher_code, saisie["code"])
                self.hass.config_entries.async_update_entry(
                    self.config_entry, data={**self.config_entry.data, "code": empreinte}
                )
                return self._enregistrer()

        return self.async_show_form(step_id="code", data_schema=SCHEMA_CODE, errors=erreurs)

    async def async_step_menu(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Générateur (worker « mode ha ») : URL, secret, repas, quota, liste de courses, météo."""
        actuel = self.config_entry.options.get("menu", {})
        erreurs: dict[str, str] = {}
        if saisie is not None:
            if not url_generateur_valide(saisie["url"]):
                erreurs["url"] = "url_invalide"
            # Secret laissé vide : l'ancien est conservé (il n'est jamais réaffiché)
            secret = saisie.get("secret") or actuel.get("secret")
            if not secret:
                erreurs["secret"] = "secret_requis"
            if not erreurs:
                return self._enregistrer(menu={
                    "url": saisie["url"].strip(),
                    "secret": secret,
                    "repas": [r for r in REPAS if r in saisie["repas"]],
                    "quota": int(saisie["quota"]),
                    "todo": saisie.get("todo"),
                    "meteo": saisie.get("meteo"),
                })

        schema = vol.Schema({
            vol.Required("url", default=actuel.get("url", "")): TextSelector(
                TextSelectorConfig(type=TextSelectorType.URL)),
            vol.Optional("secret"): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD)),
            vol.Required("repas", default=actuel.get("repas", list(REPAS_DEFAUT))): SelectSelector(
                SelectSelectorConfig(options=list(REPAS), multiple=True, translation_key="repas")),
            vol.Required("quota", default=actuel.get("quota", QUOTA_MENU_DEFAUT)): NumberSelector(
                NumberSelectorConfig(min=1, max=50, step=1, mode=NumberSelectorMode.BOX)),
            vol.Optional("todo", **({"default": actuel["todo"]} if actuel.get("todo") else {})): EntitySelector(
                EntitySelectorConfig(domain="todo")),
            vol.Optional("meteo", **({"default": actuel["meteo"]} if actuel.get("meteo") else {})): EntitySelector(
                EntitySelectorConfig(domain="weather")),
        })
        return self.async_show_form(step_id="menu", data_schema=schema, errors=erreurs)

    async def async_step_courses(self, saisie: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Magasins proposés dans « Terminer les courses » et comparés entre eux."""
        actuel = self.config_entry.options.get("courses", {})
        if saisie is not None:
            magasins = lire_magasins(saisie.get("magasins", ""))
            return self._enregistrer(courses={"magasins": "\n".join(m["nom"] for m in magasins)})

        schema = vol.Schema({
            vol.Optional("magasins", default=actuel.get("magasins", "")): TextSelector(
                TextSelectorConfig(type=TextSelectorType.TEXT, multiline=True)),
        })
        return self.async_show_form(step_id="courses", data_schema=schema)
