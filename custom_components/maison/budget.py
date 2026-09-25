"""Données du budget et clôture mensuelle.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
"""

from __future__ import annotations

import copy

HISTORIQUE_MAX = 24   # mois conservés pour le graphique d'évolution

# (nom, couleur, alerte) des catégories créées au premier lancement
CATEGORIES_DEFAUT = [
    ("Alimentation", "bleu", False),
    ("Transport", "bleu", False),
    ("Logement & Énergie", "rose", True),
    ("Loisirs & Sorties", "ambre", False),
    ("Santé", "emeraude", False),
]

# Champs envoyés par le panneau ; `mois` et `historique` sont gérés uniquement ici
CHAMPS_MODIFIABLES = (
    "revenus",
    "depensesFixes",
    "depensesVariables",
    "epargne",
    "categories",
    "imprevus",
    "fondsUrgence",
    "facturesAVenir",
    "factures",
)


def donnees_vides(mois: str) -> dict:
    """Budget vierge du premier lancement : aucune donnée d'exemple."""
    return {
        "mois": mois,
        "revenus": 0,
        "depensesFixes": 0,
        "depensesVariables": 0,
        "epargne": {"objectif": 0, "ceMois": 0, "comptes": []},
        "categories": [
            {"nom": nom, "budget": 0, "depense": 0, "couleur": couleur, "alerte": alerte}
            for nom, couleur, alerte in CATEGORIES_DEFAUT
        ],
        "imprevus": [],
        "fondsUrgence": 0,
        "facturesAVenir": [],
        "factures": [],
        "historique": [],
    }


def total_depenses(donnees: dict) -> float:
    return donnees["depensesFixes"] + donnees["depensesVariables"]


def cloturer_si_necessaire(donnees: dict, mois_courant: str) -> tuple[dict, bool]:
    """Archive le mois écoulé si le mois a changé depuis la dernière utilisation.

    Les montants prévus (revenus, dépenses fixes, budgets, objectif d'épargne…)
    sont repris pour préremplir le nouveau mois ; les montants réels repartent à zéro.
    Renvoie (données, vrai si une clôture a eu lieu).
    """
    # Format AAAA-MM : l'ordre alphabétique est l'ordre chronologique
    if donnees["mois"] >= mois_courant:
        return donnees, False

    nouveau = copy.deepcopy(donnees)
    nouveau["historique"] = [
        *donnees["historique"],
        {"mois": donnees["mois"], "total": total_depenses(donnees)},
    ][-HISTORIQUE_MAX:]
    nouveau["mois"] = mois_courant
    nouveau["depensesVariables"] = 0
    nouveau["epargne"]["ceMois"] = 0
    for categorie in nouveau["categories"]:
        categorie["depense"] = 0
    nouveau["imprevus"] = []
    return nouveau, True


def appliquer_modifications(donnees: dict, modifications: dict) -> dict:
    """Remplace les champs modifiables ; `mois` et `historique` restent intacts."""
    nouveau = copy.deepcopy(donnees)
    for champ in CHAMPS_MODIFIABLES:
        if champ in modifications:
            nouveau[champ] = copy.deepcopy(modifications[champ])
    return nouveau
