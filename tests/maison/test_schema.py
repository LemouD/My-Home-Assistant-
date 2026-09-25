"""Tests de la validation des données envoyées par le panneau (nécessite voluptuous).

Lancer depuis la racine du repo : python -m unittest discover -s tests/maison
"""

import importlib
import sys
import types
import unittest
from pathlib import Path

import voluptuous as vol

DOSSIER = Path(__file__).resolve().parents[2] / "custom_components" / "maison"
if "maison" not in sys.modules:
    paquet = types.ModuleType("maison")
    paquet.__path__ = [str(DOSSIER)]
    sys.modules["maison"] = paquet
schema = importlib.import_module("maison.schema")


def budget_valide():
    return {
        "revenus": 3200,
        "depensesFixes": 1850.5,
        "depensesVariables": 0,
        "fondsUrgence": 1200,
        "epargne": {"objectif": 300, "ceMois": 200, "comptes": [{"nom": "Livret A", "montant": 3200}]},
        "categories": [{"nom": "Alimentation", "budget": 800, "depense": 345, "couleur": "bleu"}],
        "imprevus": [{"libelle": "Réparation", "montant": 380}],
        "facturesAVenir": [{"fournisseur": "Assurance", "echeance": "2026-09-28", "montant": 72.5}],
        "factures": [{"fournisseur": "Internet", "echeance": "2026-09-28", "montant": 29.99, "statut": "paye"}],
    }


class TestSchema(unittest.TestCase):
    def invalide(self, donnees):
        with self.assertRaises(vol.Invalid):
            schema.valider_budget(donnees)

    def test_budget_valide(self):
        valide = schema.valider_budget(budget_valide())
        self.assertEqual(valide["revenus"], 3200)
        self.assertFalse(valide["categories"][0]["alerte"])   # valeur par défaut

    def test_champs_facultatifs(self):
        self.assertEqual(schema.valider_budget({"revenus": 10}), {"revenus": 10})
        self.assertEqual(schema.valider_budget({}), {})

    def test_mois_et_historique_supprimes(self):
        donnees = {**budget_valide(), "mois": "1999-01", "historique": [{"mois": "x", "total": 1}]}
        valide = schema.valider_budget(donnees)
        self.assertNotIn("mois", valide)
        self.assertNotIn("historique", valide)

    def test_cles_inconnues_supprimees_partout(self):
        donnees = budget_valide()
        donnees["pirate"] = 1
        donnees["categories"][0]["pirate"] = 1
        donnees["epargne"]["comptes"][0]["pirate"] = 1
        valide = schema.valider_budget(donnees)
        self.assertNotIn("pirate", valide)
        self.assertNotIn("pirate", valide["categories"][0])
        self.assertNotIn("pirate", valide["epargne"]["comptes"][0])

    def test_montants_refuses(self):
        for valeur in (-1, 1_000_001, float("inf"), float("nan"), True, "100", None, [1]):
            with self.subTest(valeur=valeur):
                self.invalide({"revenus": valeur})

    def test_textes(self):
        valide = schema.valider_budget({"imprevus": [{"libelle": "  Garage  ", "montant": 1}]})
        self.assertEqual(valide["imprevus"][0]["libelle"], "Garage")
        for libelle in ("", "   ", "x" * 61, "a\nb", "a\x00b", 12):
            with self.subTest(libelle=libelle):
                self.invalide({"imprevus": [{"libelle": libelle, "montant": 1}]})

    def test_html_conserve_comme_texte(self):
        # Le panneau affiche avec textContent : le contenu est stocké tel quel, sans être interprété
        valide = schema.valider_budget({"imprevus": [{"libelle": "<img src=x>", "montant": 1}]})
        self.assertEqual(valide["imprevus"][0]["libelle"], "<img src=x>")

    def test_dates(self):
        for echeance in ("2026-02-30", "28/09/2026", "2026-9-28", "2026-09-28T00:00", 20260928):
            with self.subTest(echeance=echeance):
                self.invalide({"facturesAVenir": [{"fournisseur": "A", "echeance": echeance, "montant": 1}]})

    def test_valeurs_enumerees(self):
        self.invalide({"categories": [{"nom": "A", "budget": 1, "depense": 0, "couleur": "noir"}]})
        self.invalide({"factures": [{"fournisseur": "A", "echeance": "2026-01-01", "montant": 1, "statut": "oublie"}]})
        self.invalide({"categories": [{"nom": "A", "budget": 1, "depense": 0, "couleur": "bleu", "alerte": "oui"}]})

    def test_tailles_de_listes(self):
        facture = {"fournisseur": "A", "echeance": "2026-01-01", "montant": 1, "statut": "paye"}
        schema.valider_budget({"factures": [facture] * 50})
        self.invalide({"factures": [facture] * 51})
        self.invalide({"categories": [{"nom": "A", "budget": 1, "depense": 0, "couleur": "bleu"}] * 13})
        self.invalide({"epargne": {"objectif": 0, "ceMois": 0, "comptes": [{"nom": "A", "montant": 1}] * 11}})

    def test_types_racine(self):
        for donnees in (None, [], "texte", 1):
            with self.subTest(donnees=donnees):
                self.invalide(donnees)
        self.invalide({"categories": {"nom": "A"}})


if __name__ == "__main__":
    unittest.main()
