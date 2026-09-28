"""Tests du résumé du budget pour la vue Courses, sans Home Assistant.

Lancer depuis la racine du repo : python -m unittest discover -s tests/maison
"""

import importlib
import sys
import types
import unittest
from pathlib import Path

DOSSIER = Path(__file__).resolve().parents[2] / "custom_components" / "maison"
if "maison" not in sys.modules:
    paquet = types.ModuleType("maison")
    paquet.__path__ = [str(DOSSIER)]
    sys.modules["maison"] = paquet
budget = importlib.import_module("maison.budget")
resume = importlib.import_module("maison.resume")


def budget_rempli():
    donnees = budget.donnees_vides("2026-09")
    donnees.update(revenus=3200, depensesFixes=1850, depensesVariables=600, fondsUrgence=1200)
    donnees["categories"][0].update(budget=450, depense=312)
    donnees["epargne"]["comptes"] = [{"nom": "Livret", "montant": 3200}]
    donnees["factures"] = [{"fournisseur": "Internet", "echeance": "2026-09-28", "montant": 29.99, "statut": "paye"}]
    return donnees


class TestResumeCourses(unittest.TestCase):
    def test_contenu(self):
        self.assertEqual(resume.resume_courses(budget_rempli()), {
            "mois": "2026-09",
            "alimentation": {"budget": 450, "depense": 312},
            "reste": 750,
        })

    def test_minimal(self):
        # Rien d'autre du budget ne sort : ni épargne, ni factures, ni revenus, ni historique
        self.assertEqual(set(resume.resume_courses(budget_rempli())), {"mois", "alimentation", "reste"})
        self.assertEqual(set(resume.resume_courses(budget_rempli())["alimentation"]), {"budget", "depense"})

    def test_nom_insensible_casse_et_espaces(self):
        donnees = budget_rempli()
        donnees["categories"][0]["nom"] = "  ALIMENTATION "
        self.assertEqual(resume.resume_courses(donnees)["alimentation"], {"budget": 450, "depense": 312})

    def test_categorie_absente(self):
        donnees = budget_rempli()
        donnees["categories"] = [c for c in donnees["categories"] if c["nom"] != "Alimentation"]
        self.assertIsNone(resume.resume_courses(donnees)["alimentation"])

    def test_reste_negatif(self):
        donnees = budget_rempli()
        donnees["depensesVariables"] = 2000
        self.assertEqual(resume.resume_courses(donnees)["reste"], -650)

    def test_budget_vierge(self):
        vide = resume.resume_courses(budget.donnees_vides("2026-10"))
        self.assertEqual(vide, {"mois": "2026-10", "alimentation": {"budget": 0, "depense": 0}, "reste": 0})


if __name__ == "__main__":
    unittest.main()
