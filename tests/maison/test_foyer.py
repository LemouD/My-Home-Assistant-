"""Tests des réglages du foyer (membres, affichage, notifications), sans Home Assistant.

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
foyer = importlib.import_module("maison.foyer")


class TestMembre(unittest.TestCase):
    def test_valide(self):
        m = foyer.valider_membre({"prenom": "  Marie-Élodie   N’Diaye ", "couleur": "#4a9eff"})
        self.assertEqual(m, {"prenom": "Marie-Élodie N'Diaye", "couleur": "#4A9EFF", "role": "enfant", "personne": None})
        m = foyer.valider_membre({"prenom": "Awa", "couleur": "#2ECC71", "role": "parent", "personne": "person.awa"})
        self.assertEqual((m["role"], m["personne"]), ("parent", "person.awa"))

    def test_refus(self):
        for modif in ({"prenom": ""}, {"prenom": "x" * 31}, {"prenom": "<script>"}, {"prenom": "Ali2"},
                      {"prenom": "--"}, {"prenom": 12}, {"prenom": "a\x00b"},
                      {"couleur": "red"}, {"couleur": "#FFF"}, {"couleur": "#FFFFFF;background:url(x)"},
                      {"role": "admin"}, {"personne": "light.salon"}, {"personne": "person.A"},
                      {"adresse": "12 rue des Lilas"}, {"id": "abcdefabcdef"}):
            with self.subTest(modif=modif):
                with self.assertRaises(vol.Invalid):
                    foyer.valider_membre({"prenom": "Awa", "couleur": "#FFFFFF", **modif})
        with self.assertRaises(vol.Invalid):
            foyer.valider_membre(["Awa"])

    def test_modification(self):
        self.assertEqual(foyer.valider_modification_membre({"couleur": "#abcdef"}), {"couleur": "#ABCDEF"})
        self.assertEqual(foyer.valider_modification_membre({"personne": ""}), {"personne": None})
        for invalide in ({}, {"role": "admin"}, {"id": "abcdefabcdef"}, "Awa"):
            with self.subTest(invalide=invalide):
                with self.assertRaises(vol.Invalid):
                    foyer.valider_modification_membre(invalide)

    def test_prenom_pris(self):
        membres = [{"id": "a" * 12, "prenom": "Élodie"}]
        self.assertTrue(foyer.prenom_pris(membres, "elodie"))
        self.assertTrue(foyer.prenom_pris(membres, "ÉLODIE"))
        self.assertFalse(foyer.prenom_pris(membres, "Élodie", sauf="a" * 12))
        self.assertFalse(foyer.prenom_pris(membres, "Awa"))


class TestReglages(unittest.TestCase):
    def test_affichage(self):
        self.assertEqual(foyer.valider_affichage({"theme": "clair", "rafraichissement": 5}),
                         {"theme": "clair", "rafraichissement": 5})
        for invalide in ({"theme": "rose"}, {"rafraichissement": 1}, {"rafraichissement": True},
                         {"langue": "en"}, {"format_date": "MM/JJ"}):
            with self.subTest(invalide=invalide):
                with self.assertRaises(vol.Invalid):
                    foyer.valider_affichage(invalide)

    def test_notifications(self):
        self.assertEqual(foyer.valider_notifications({"silencieux": True}), {"silencieux": True})
        for invalide in ({"silencieux": "oui"}, {"inconnue": True}, [True]):
            with self.subTest(invalide=invalide):
                with self.assertRaises(vol.Invalid):
                    foyer.valider_notifications(invalide)

    def test_nom_foyer(self):
        self.assertEqual(foyer.valider_nom_foyer(" Les  Diop "), "Les Diop")
        for invalide in ("", "x" * 41, "12 rue des Lilas", None):
            with self.subTest(invalide=invalide):
                with self.assertRaises(vol.Invalid):
                    foyer.valider_nom_foyer(invalide)


class TestRelecture(unittest.TestCase):
    def test_vide(self):
        self.assertEqual(foyer.completer(None), foyer.etat_initial())

    def test_donnees_abimees(self):
        etat = foyer.completer({
            "nom": "<b>",
            "adresse": "12 rue des Lilas",
            "membres": [
                {"id": "a" * 12, "prenom": "Awa", "couleur": "#FFFFFF", "role": "parent", "personne": None},
                {"id": "b" * 12, "prenom": "Ali", "couleur": "rouge"},
                {"id": "pas-un-id", "prenom": "Lou", "couleur": "#000000"},
                "texte",
            ],
            "affichage": {"theme": "clair", "rafraichissement": 999},
            "notifications": {"budget": True, "inconnue": True},
        })
        self.assertEqual(etat["nom"], "")
        self.assertNotIn("adresse", etat)
        self.assertEqual([m["prenom"] for m in etat["membres"]], ["Awa"])
        self.assertEqual(etat["affichage"]["theme"], "clair")
        self.assertEqual(etat["affichage"]["rafraichissement"], 30)
        self.assertTrue(etat["notifications"]["budget"])
        self.assertNotIn("inconnue", etat["notifications"])

    def test_membres_max(self):
        membres = [{"id": f"{i:012x}", "prenom": "Awa" + "a" * i, "couleur": "#FFFFFF"} for i in range(20)]
        self.assertEqual(len(foyer.completer({"membres": membres})["membres"]), foyer.MEMBRES_MAX)


if __name__ == "__main__":
    unittest.main()
