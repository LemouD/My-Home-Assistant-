"""Réglages du foyer faits depuis la tablette : membres, affichage, notifications.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
Les membres sont de simples profils (prénom, couleur, rôle), pas des comptes HA :
le rôle « parent » ne donne aucun droit. Aucune adresse n'est conservée.
"""

from __future__ import annotations

import re
import unicodedata

import voluptuous as vol

MEMBRES_MAX = 12
PRENOM_MAX = 30
NOM_FOYER_MAX = 40
ROLES = ("parent", "enfant")

# Listes fermées : toute valeur hors liste est refusée
THEMES = ("sombre", "clair")
FORMATS_DATE = ("JJ/MM/AAAA", "AAAA-MM-JJ")
TEMPERATURES = ("celsius", "fahrenheit")
RAFRAICHISSEMENTS = (5, 30, 60)          # secondes
NOTIFICATIONS = ("energie", "factures", "budget", "calendrier", "courses", "securite", "silencieux")

AFFICHAGE_DEFAUT = {"theme": "sombre", "format_date": "JJ/MM/AAAA", "temperature": "celsius", "rafraichissement": 30}
NOTIFICATIONS_DEFAUT = {cle: cle not in ("budget", "silencieux") for cle in NOTIFICATIONS}

_COULEUR = re.compile(r"#[0-9A-Fa-f]{6}")
_PERSONNE = re.compile(r"person\.[a-z0-9_]{1,60}")
_IDENTIFIANT = re.compile(r"[0-9a-f]{12}")


def _texte_nom(maximum: int):
    """Lettres (accents compris), espaces, trait d'union et apostrophe uniquement."""
    def valider(valeur: object) -> str:
        if not isinstance(valeur, str):
            raise vol.Invalid("texte attendu")
        valeur = unicodedata.normalize("NFC", re.sub(r"\s+", " ", valeur).strip()).replace("’", "'")
        if not 1 <= len(valeur) <= maximum:
            raise vol.Invalid(f"1 à {maximum} caractères attendus")
        if not all(c.isalpha() or c in " -'" for c in valeur) or not any(c.isalpha() for c in valeur):
            raise vol.Invalid("lettres, espaces, - et ' uniquement")
        return valeur
    return valider


def _couleur(valeur: object) -> str:
    # Utilisée telle quelle en CSS par le panneau : format strict #RRGGBB
    if not isinstance(valeur, str) or not _COULEUR.fullmatch(valeur):
        raise vol.Invalid("couleur #RRGGBB attendue")
    return valeur.upper()


def _personne(valeur: object) -> str | None:
    """Lien facultatif vers une entité person.* (présence) ; None ou "" pour le retirer."""
    if valeur is None or valeur == "":
        return None
    if not isinstance(valeur, str) or not _PERSONNE.fullmatch(valeur):
        raise vol.Invalid("entité person.* attendue")
    return valeur


def _objet(schema: dict, **options) -> vol.Schema:
    # Clés inconnues refusées : rien d'autre que les champs prévus n'est stocké
    return vol.Schema(schema, extra=vol.PREVENT_EXTRA, **options)


_CHAMPS_MEMBRE = {
    "prenom": _texte_nom(PRENOM_MAX),
    "couleur": _couleur,
    "role": vol.In(ROLES),
    "personne": _personne,
}

MEMBRE = _objet({
    vol.Required("prenom"): _CHAMPS_MEMBRE["prenom"],
    vol.Required("couleur"): _CHAMPS_MEMBRE["couleur"],
    vol.Optional("role", default="enfant"): _CHAMPS_MEMBRE["role"],
    vol.Optional("personne", default=None): _CHAMPS_MEMBRE["personne"],
})
MODIFICATION_MEMBRE = _objet({vol.Optional(cle): v for cle, v in _CHAMPS_MEMBRE.items()})

AFFICHAGE = _objet({
    vol.Optional("theme"): vol.In(THEMES),
    vol.Optional("format_date"): vol.In(FORMATS_DATE),
    vol.Optional("temperature"): vol.In(TEMPERATURES),
    vol.Optional("rafraichissement"): vol.In(RAFRAICHISSEMENTS),
})
NOTIFS = _objet({vol.Optional(cle): bool for cle in NOTIFICATIONS})


def _dict(valeur: object) -> dict:
    if not isinstance(valeur, dict):
        raise vol.Invalid("objet attendu")
    return valeur


def valider_membre(membre: object) -> dict:
    return MEMBRE(_dict(membre))


def valider_modification_membre(modification: object) -> dict:
    valide = MODIFICATION_MEMBRE(_dict(modification))
    if not valide:
        raise vol.Invalid("aucune modification")
    return valide


def valider_affichage(affichage: object) -> dict:
    valide = AFFICHAGE(_dict(affichage))
    if isinstance(valide.get("rafraichissement"), bool):
        raise vol.Invalid("nombre attendu")
    return valide


def valider_notifications(notifications: object) -> dict:
    return NOTIFS(_dict(notifications))


def valider_nom_foyer(nom: object) -> str:
    return _texte_nom(NOM_FOYER_MAX)(nom)


def identifiant_valide(ident: object) -> bool:
    return isinstance(ident, str) and bool(_IDENTIFIANT.fullmatch(ident))


def cle_prenom(prenom: str) -> str:
    """« Élodie » et « elodie » désignent le même membre."""
    sans_accents = unicodedata.normalize("NFKD", prenom).encode("ascii", "ignore").decode()
    return re.sub(r"[\s'-]+", " ", sans_accents).strip().casefold()


def prenom_pris(membres: list[dict], prenom: str, sauf: str | None = None) -> bool:
    cle = cle_prenom(prenom)
    return any(cle_prenom(m["prenom"]) == cle for m in membres if m["id"] != sauf)


def etat_initial() -> dict:
    return {"nom": "", "membres": [], "affichage": dict(AFFICHAGE_DEFAUT), "notifications": dict(NOTIFICATIONS_DEFAUT)}


def completer(stocke: object) -> dict:
    """Données relues du disque : valeurs inconnues ou abîmées remplacées par les défauts."""
    etat = etat_initial()
    if not isinstance(stocke, dict):
        return etat
    try:
        etat["nom"] = valider_nom_foyer(stocke.get("nom"))
    except vol.Invalid:
        pass
    for m in stocke.get("membres") or []:
        try:
            if isinstance(m, dict) and identifiant_valide(m.get("id")):
                etat["membres"].append({"id": m["id"], **valider_membre({k: v for k, v in m.items() if k != "id"})})
        except vol.Invalid:
            continue
    etat["membres"] = etat["membres"][:MEMBRES_MAX]
    for cle, valider in (("affichage", valider_affichage), ("notifications", valider_notifications)):
        for k, v in (stocke.get(cle) or {}).items() if isinstance(stocke.get(cle), dict) else ():
            try:
                etat[cle].update(valider({k: v}))
            except vol.Invalid:
                continue
    return etat
