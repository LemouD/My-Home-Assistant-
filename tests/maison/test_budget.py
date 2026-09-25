"""Tests de la logique du budget (clôture mensuelle), sans Home Assistant.

Lancer depuis la racine du repo : python -m unittest discover -s tests/maison
"""

import importlib
import sys
import types
import unittest
from pathlib import Path

# Charge le paquet de l'intégration sans exécuter son __init__.py (qui importe Home Assistant)
DOSSIER = Path(__file__).resolve().parents[2] / "custom_components" / "maison"
if "maison" not in sys.modules:
    paquet = types.ModuleType("maison")
    paquet.__path__ = [str(DOSSIER)]
    sys.modules["maison"] = paquet
budget = importlib.import_module("maison.budget")


def budget_rempli(mois="2026-09"):
    donnees = budget.donnees_vides(mois)
    donnees.update(revenus=3200, depensesFixes=1850, depensesVariables=600, fondsUrgence=1200)
    donnees["epargne"] = {"objectif": 300, "ceMois": 200, "comptes": [{"nom": "Livret", "montant": 3200}]}
    donnees["categories"][0].update(budget=800, depense=345)
    donnees["imprevus"] = [{"libelle": "Réparation", "montant": 380}]
    donnees["factures"] = [{"fournisseur": "Internet", "echeance": "2026-09-28", "montant": 29.99, "statut": "paye"}]
    return donnees


class TestDonneesVides(unittest.TestCase):
    def test_aucune_donnee_d_exemple(self):
        donnees = budget.donnees_vides("2026-09")
        self.assertEqual(donnees["mois"], "2026-09")
        self.assertEqual(donnees["revenus"], 0)
        self.assertEqual(donnees["imprevus"], [])
        self.assertEqual(donnees["historique"], [])
        self.assertTrue(all(c["budget"] == 0 and c["depense"] == 0 for c in donnees["categories"]))


class TestCloture(unittest.TestCase):
    def test_meme_mois_rien_ne_change(self):
        donnees = budget_rempli("2026-09")
        resultat, cloture = budget.cloturer_si_necessaire(donnees, "2026-09")
        self.assertFalse(cloture)
        self.assertIs(resultat, donnees)

    def test_changement_de_mois_archive_le_total(self):
        resultat, cloture = budget.cloturer_si_necessaire(budget_rempli("2026-09"), "2026-10")
        self.assertTrue(cloture)
        self.assertEqual(resultat["mois"], "2026-10")
        self.assertEqual(resultat["historique"], [{"mois": "2026-09", "total": 2450}])

    def test_montants_reels_remis_a_zero(self):
        resultat, _ = budget.cloturer_si_necessaire(budget_rempli("2026-09"), "2026-10")
        self.assertEqual(resultat["depensesVariables"], 0)
        self.assertEqual(resultat["epargne"]["ceMois"], 0)
        self.assertEqual(resultat["categories"][0]["depense"], 0)
        self.assertEqual(resultat["imprevus"], [])

    def test_montants_prevus_reportes(self):
        resultat, _ = budget.cloturer_si_necessaire(budget_rempli("2026-09"), "2026-10")
        self.assertEqual(resultat["revenus"], 3200)
        self.assertEqual(resultat["depensesFixes"], 1850)
        self.assertEqual(resultat["categories"][0]["budget"], 800)
        self.assertEqual(resultat["epargne"]["objectif"], 300)
        self.assertEqual(resultat["epargne"]["comptes"], [{"nom": "Livret", "montant": 3200}])
        self.assertEqual(resultat["fondsUrgence"], 1200)
        self.assertEqual(len(resultat["factures"]), 1)

    def test_donnees_d_origine_non_modifiees(self):
        donnees = budget_rempli("2026-09")
        budget.cloturer_si_necessaire(donnees, "2026-10")
        self.assertEqual(donnees["mois"], "2026-09")
        self.assertEqual(donnees["categories"][0]["depense"], 345)

    def test_changement_d_annee(self):
        resultat, cloture = budget.cloturer_si_necessaire(budget_rempli("2026-12"), "2027-01")
        self.assertTrue(cloture)
        self.assertEqual(resultat["historique"][-1]["mois"], "2026-12")

    def test_plusieurs_mois_sans_utilisation(self):
        resultat, _ = budget.cloturer_si_necessaire(budget_rempli("2026-06"), "2026-09")
        self.assertEqual(resultat["mois"], "2026-09")
        self.assertEqual([h["mois"] for h in resultat["historique"]], ["2026-06"])

    def test_historique_limite(self):
        donnees = budget_rempli("2026-09")
        donnees["historique"] = [{"mois": f"x{i}", "total": i} for i in range(budget.HISTORIQUE_MAX)]
        resultat, _ = budget.cloturer_si_necessaire(donnees, "2026-10")
        self.assertEqual(len(resultat["historique"]), budget.HISTORIQUE_MAX)
        self.assertEqual(resultat["historique"][-1]["mois"], "2026-09")


class TestModifications(unittest.TestCase):
    def test_mois_et_historique_proteges(self):
        donnees = budget_rempli("2026-09")
        donnees["historique"] = [{"mois": "2026-08", "total": 2000}]
        resultat = budget.appliquer_modifications(donnees, {
            "revenus": 4000,
            "mois": "2030-01",
            "historique": [],
        })
        self.assertEqual(resultat["revenus"], 4000)
        self.assertEqual(resultat["mois"], "2026-09")
        self.assertEqual(resultat["historique"], [{"mois": "2026-08", "total": 2000}])

    def test_champs_absents_conserves(self):
        resultat = budget.appliquer_modifications(budget_rempli(), {"revenus": 1})
        self.assertEqual(resultat["depensesFixes"], 1850)


if __name__ == "__main__":
    unittest.main()
