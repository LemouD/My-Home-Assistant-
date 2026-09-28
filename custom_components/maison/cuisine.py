"""État du menu : appels au générateur (worker « mode ha »), quota, stockage, liste de courses."""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DELAI_WORKER,
    EXPIRATION_GENERATION,
    QUOTA_MENU_DEFAUT,
    STOCKAGE_MENU_CLE,
    STOCKAGE_MENU_VERSION,
)
from .menu import (
    description_article,
    evaluer_plat,
    lignes_courses,
    lire_description,
    nom_article,
    normaliser_nom,
    titre_article,
)

_LOGGER = logging.getLogger(__name__)

TAILLE_REPONSE_MAX = 1_000_000   # octets
NOUVEAUX_ESSAIS_MAX = 3          # plats rejetés regénérés un par un, au plus


class MenuErreur(Exception):
    """`code` est le code d'erreur WebSocket renvoyé au panneau."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Cuisine:
    def __init__(self, hass: HomeAssistant, entree: ConfigEntry) -> None:
        self.hass = hass
        self.entree = entree
        # private=True : fichier .storage lisible par le seul utilisateur système de HA
        self._stockage = Store(hass, STOCKAGE_MENU_VERSION, STOCKAGE_MENU_CLE, private=True)
        self._donnees: dict = {"menu": None, "quota": {"jour": "", "utilise": 0}}
        self._courses = asyncio.Lock()
        self._en_cours_depuis: float | None = None

    async def charger(self) -> None:
        if stockees := await self._stockage.async_load():
            self._donnees = stockees

    # ---- RÉGLAGES (options de l'intégration, saisies par un admin) ----

    @property
    def _options(self) -> dict:
        return self.entree.options.get("menu", {})

    @property
    def configure(self) -> bool:
        return bool(self._options.get("url") and self._options.get("secret"))

    @property
    def repas_actifs(self) -> list[str]:
        return list(self._options.get("repas", []))

    # ---- QUOTA ET GÉNÉRATION EN COURS ----

    def _quota(self) -> dict:
        maximum = int(self._options.get("quota", QUOTA_MENU_DEFAUT))
        aujourdhui = dt_util.now().date().isoformat()
        utilise = self._donnees["quota"]["utilise"] if self._donnees["quota"]["jour"] == aujourdhui else 0
        return {"jour": aujourdhui, "utilise": utilise, "max": maximum}

    @property
    def en_cours(self) -> bool:
        # Expiration : un plantage pendant une génération ne bloque pas le menu indéfiniment
        return self._en_cours_depuis is not None and time.monotonic() - self._en_cours_depuis < EXPIRATION_GENERATION

    def etat(self) -> dict:
        quota = self._quota()
        return {
            "configure": self.configure,
            "repas": self.repas_actifs,
            "quota": {"utilise": quota["utilise"], "max": quota["max"]},
            "enCours": self.en_cours,
        }

    def _reserver(self) -> None:
        """Vérifie et consomme une génération du quota (avant l'appel : les échecs comptent aussi)."""
        if not self.configure:
            raise MenuErreur("non_configure", "Générateur de menu non configuré")
        if self.en_cours:
            raise MenuErreur("generation_en_cours", "Une génération est déjà en cours")
        quota = self._quota()
        if quota["utilise"] >= quota["max"]:
            raise MenuErreur("quota_atteint", "Nombre de générations du jour atteint")
        self._donnees["quota"] = {"jour": quota["jour"], "utilise": quota["utilise"] + 1}
        self._en_cours_depuis = time.monotonic()

    # ---- APPEL DU GÉNÉRATEUR ----

    async def _appeler_worker(self, parametres: dict, jours: int, repas: list[str]) -> list[dict]:
        url = self._options["url"]
        corps = {
            "type": "ha",
            "jours": jours,
            "repas": repas,
            "personnes": parametres["personnes"],
            "preferences": parametres["preferences"],
            "allergies": parametres["allergies"],
            "note": parametres["note"],
        }
        try:
            async with async_get_clientsession(self.hass).post(
                url,
                json=corps,
                headers={"X-App-Secret": self._options["secret"]},
                timeout=aiohttp.ClientTimeout(total=DELAI_WORKER),
                allow_redirects=False,
            ) as reponse:
                brut = await reponse.content.read(TAILLE_REPONSE_MAX + 1)
                statut = reponse.status
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.warning("Menu : générateur injoignable (%s)", type(err).__name__)
            raise MenuErreur("generation_indisponible", "Générateur injoignable") from err

        if statut == 401:
            _LOGGER.error("Menu : secret refusé par le générateur, vérifier les options de l'intégration")
            raise MenuErreur("non_configure", "Secret du générateur refusé")
        if statut != 200 or len(brut) > TAILLE_REPONSE_MAX:
            _LOGGER.warning("Menu : réponse du générateur refusée (HTTP %s)", statut)
            raise MenuErreur("generation_indisponible", "Générateur indisponible, réessayer plus tard")
        try:
            donnees = json.loads(brut)
            jours_recus = donnees["jours"]
            if not isinstance(jours_recus, list) or len(jours_recus) != jours:
                raise ValueError
            return [j if isinstance(j, dict) else {} for j in jours_recus]
        except (ValueError, KeyError, TypeError) as err:
            raise MenuErreur("generation_invalide", "Réponse du générateur inutilisable") from err

    async def _plat_conforme(self, parametres: dict, repas: str) -> tuple[dict | None, str]:
        """Nouvel essai pour un seul créneau : (recette, "") ou (None, motif)."""
        try:
            jours = await self._appeler_worker(parametres, 1, [repas])
        except MenuErreur:
            return None, "invalide"
        recette, motif = evaluer_plat(jours[0].get(repas), parametres["allergies"])
        return recette, motif or ""

    # ---- COMMANDES ----

    def lire(self) -> dict | None:
        return self._donnees["menu"]

    async def generer(self, parametres: dict) -> dict:
        repas = [r for r in parametres["repas"] if r in self.repas_actifs]
        if not repas:
            raise MenuErreur("parametres_invalides", "Aucun des repas demandés n'est activé")
        self._reserver()
        try:
            jours_bruts = await self._appeler_worker(parametres, parametres["jours"], repas)
            debut = dt_util.now().date()
            recettes: dict[str, dict] = {}
            jours: list[dict] = []
            rejets: list[tuple[int, str]] = []
            for index, brut in enumerate(jours_bruts):
                creneaux = {}
                for r in repas:
                    recette, motif = evaluer_plat(brut.get(r), parametres["allergies"])
                    if recette:
                        creneaux[r] = {"recette": self._ranger(recettes, recette)}
                    else:
                        creneaux[r] = {"rejete": True, "motif": motif}
                        rejets.append((index, r))
                jours.append({"date": (debut + timedelta(days=index)).isoformat(), "repas": creneaux})

            # Quelques plats rejetés regénérés un par un, sans compter dans le quota
            for index, r in rejets[:NOUVEAUX_ESSAIS_MAX]:
                recette, motif = await self._plat_conforme(parametres, r)
                if recette:
                    jours[index]["repas"][r] = {"recette": self._ranger(recettes, recette)}
                else:
                    jours[index]["repas"][r]["motif"] = motif

            restants = sum(1 for j in jours for c in j["repas"].values() if c.get("rejete"))
            if restants * 2 > len(jours) * len(repas):
                raise MenuErreur("generation_invalide", "Trop de plats non conformes, réessayer")

            menu = {
                "id": secrets.token_hex(8),
                "cree": dt_util.now().isoformat(),
                "parametres": {**parametres, "repas": repas},
                "jours": jours,
                "recettes": recettes,
            }
            self._donnees["menu"] = menu
            return menu
        finally:
            self._en_cours_depuis = None
            await self._stockage.async_save(self._donnees)

    async def remplacer(self, date: str, repas: str) -> dict:
        menu = self._donnees["menu"]
        jour = next((j for j in (menu or {}).get("jours", []) if j["date"] == date), None)
        if jour is None or repas not in jour["repas"]:
            raise MenuErreur("parametres_invalides", "Ce repas n'est pas planifié dans le menu courant")
        self._reserver()
        try:
            recette, motif = await self._plat_conforme(menu["parametres"], repas)
            if recette is None:
                raise MenuErreur("generation_invalide", f"Nouveau plat non conforme ({motif})")
            ancien = jour["repas"][repas].get("recette")
            jour["repas"][repas] = {"recette": self._ranger(menu["recettes"], recette)}
            # Recette qui n'est plus utilisée nulle part : retirée
            utilisees = {c.get("recette") for j in menu["jours"] for c in j["repas"].values()}
            if ancien and ancien not in utilisees:
                menu["recettes"].pop(ancien, None)
            return menu
        finally:
            self._en_cours_depuis = None
            await self._stockage.async_save(self._donnees)

    async def vers_courses(self, ids: list[str] | None) -> dict:
        menu = self._donnees["menu"]
        if not menu:
            raise MenuErreur("menu_absent", "Aucun menu à ajouter")
        entite = self._options.get("todo")
        if not entite or self.hass.states.get(entite) is None:
            raise MenuErreur("courses_non_configure", "Liste de courses non configurée")
        choisies = [menu["recettes"][i] for i in (ids if ids is not None else menu["recettes"]) if i in menu["recettes"]]
        lignes, ignores = lignes_courses(choisies)

        async with self._courses:
            existants = await self._articles_a_acheter(entite)
            ajoutes = fusionnes = 0
            for ligne in lignes:
                deja = existants.get((ligne["cle"], ligne["unite"]))
                if deja:
                    quantite = round(deja["quantite"] + ligne["quantite"], 3)
                    await self._service(entite, "update_item", {
                        "item": deja["uid"],
                        "rename": titre_article(nom_article(deja["titre"]), quantite, ligne["unite"]),
                        "description": description_article(quantite, ligne["unite"], deja["rayon"], deja["source"]),
                    })
                    fusionnes += 1
                else:
                    await self._service(entite, "add_item", {
                        "item": titre_article(ligne["nom"], ligne["quantite"], ligne["unite"]),
                        "description": description_article(ligne["quantite"], ligne["unite"], ligne["rayon"]),
                    })
                    ajoutes += 1
        return {"ajoutes": ajoutes, "fusionnes": fusionnes, "ignores": ignores}

    # ---- OUTILS ----

    @staticmethod
    def _ranger(recettes: dict, recette: dict) -> str:
        identifiant = secrets.token_hex(6)
        recettes[identifiant] = {"id": identifiant, **recette}
        return identifiant

    async def _service(self, entite: str, service: str, donnees: dict[str, Any]) -> Any:
        return await self.hass.services.async_call(
            "todo", service, {"entity_id": entite, **donnees}, blocking=True,
            return_response=service == "get_items",
        )

    async def _articles_a_acheter(self, entite: str) -> dict[tuple[str, str], dict]:
        """Articles non cochés au format commun, indexés par (nom normalisé, unité)."""
        reponse = await self._service(entite, "get_items", {"status": ["needs_action"]})
        articles = {}
        for item in (reponse or {}).get(entite, {}).get("items", []):
            infos = lire_description(item.get("description"))
            titre = item.get("summary") or ""
            if infos and item.get("uid"):
                articles.setdefault((normaliser_nom(nom_article(titre)), infos["unite"]), {
                    "uid": item["uid"], "titre": titre, **infos,
                })
        return articles
