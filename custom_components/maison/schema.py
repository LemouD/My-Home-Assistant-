"""Validation des données du budget envoyées par le panneau.

Dépend seulement de voluptuous (fourni avec Home Assistant) : testable seul (tests/maison/).
Les clés inconnues sont supprimées ; `mois` et `historique` ne sont jamais acceptés.
"""

from __future__ import annotations

import math
import re
from datetime import date

import voluptuous as vol

MONTANT_MAX = 1_000_000
TEXTE_MAX = 60
FORMAT_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def _montant(valeur: object) -> float:
    # bool est un sous-type d'int en Python : refusé explicitement
    if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
        raise vol.Invalid("montant attendu")
    if not math.isfinite(valeur) or not 0 <= valeur <= MONTANT_MAX:
        raise vol.Invalid(f"montant hors limites (0 à {MONTANT_MAX})")
    return valeur


def _texte(valeur: object) -> str:
    if not isinstance(valeur, str):
        raise vol.Invalid("texte attendu")
    valeur = valeur.strip()
    if not 1 <= len(valeur) <= TEXTE_MAX:
        raise vol.Invalid(f"texte de 1 à {TEXTE_MAX} caractères attendu")
    if any(ord(c) < 32 or ord(c) == 127 for c in valeur):
        raise vol.Invalid("caractères de contrôle interdits")
    return valeur


def _date(valeur: object) -> str:
    if not isinstance(valeur, str) or not FORMAT_DATE.fullmatch(valeur):
        raise vol.Invalid("date AAAA-MM-JJ attendue")
    try:
        date.fromisoformat(valeur)
    except ValueError as err:
        raise vol.Invalid("date inexistante") from err
    return valeur


def _liste(element: vol.Schema, taille_max: int) -> vol.All:
    return vol.All(list, vol.Length(max=taille_max), [element])


def _objet(champs: dict) -> vol.Schema:
    return vol.Schema(champs, extra=vol.REMOVE_EXTRA)


COMPTE = _objet({vol.Required("nom"): _texte, vol.Required("montant"): _montant})

CATEGORIE = _objet({
    vol.Required("nom"): _texte,
    vol.Required("budget"): _montant,
    vol.Required("depense"): _montant,
    vol.Required("couleur"): vol.In(["bleu", "rose", "ambre", "emeraude"]),
    vol.Optional("alerte", default=False): bool,
})

IMPREVU = _objet({vol.Required("libelle"): _texte, vol.Required("montant"): _montant})

FACTURE_A_VENIR = _objet({
    vol.Required("fournisseur"): _texte,
    vol.Required("echeance"): _date,
    vol.Required("montant"): _montant,
})

FACTURE = _objet({
    vol.Required("fournisseur"): _texte,
    vol.Required("echeance"): _date,
    vol.Required("montant"): _montant,
    vol.Required("statut"): vol.In(["a-payer", "paye", "retard"]),
})

EPARGNE = _objet({
    vol.Required("objectif"): _montant,
    vol.Required("ceMois"): _montant,
    vol.Required("comptes"): _liste(COMPTE, 10),
})

# Chaque champ est facultatif : seuls les champs envoyés sont remplacés
BUDGET = _objet({
    vol.Optional("revenus"): _montant,
    vol.Optional("depensesFixes"): _montant,
    vol.Optional("depensesVariables"): _montant,
    vol.Optional("fondsUrgence"): _montant,
    vol.Optional("epargne"): EPARGNE,
    vol.Optional("categories"): _liste(CATEGORIE, 12),
    vol.Optional("imprevus"): _liste(IMPREVU, 20),
    vol.Optional("facturesAVenir"): _liste(FACTURE_A_VENIR, 20),
    vol.Optional("factures"): _liste(FACTURE, 50),
})


def valider_budget(donnees: object) -> dict:
    """Renvoie les données nettoyées, ou lève vol.Invalid."""
    if not isinstance(donnees, dict):
        raise vol.Invalid("objet attendu")
    return BUDGET(donnees)
