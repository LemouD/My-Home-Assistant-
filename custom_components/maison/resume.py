"""Résumé minimal du budget pour la vue Courses.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
Ne renvoie que ce dont la vue Courses a besoin, pas le budget complet.
"""

from __future__ import annotations

from . import budget
from .const import CATEGORIE_COURSES


def resume_courses(donnees: dict, categorie: str = CATEGORIE_COURSES) -> dict:
    """{mois, alimentation: {budget, depense} | None, reste}.

    `alimentation` vaut None si aucune catégorie ne porte ce nom (renommée ou supprimée).
    """
    cible = categorie.strip().casefold()
    trouvee = next(
        (c for c in donnees.get("categories", []) if c.get("nom", "").strip().casefold() == cible),
        None,
    )
    return {
        "mois": donnees["mois"],
        "alimentation": {"budget": trouvee["budget"], "depense": trouvee["depense"]} if trouvee else None,
        "reste": donnees["revenus"] - budget.total_depenses(donnees),
    }
