"""Tests des dernières courses et du comparateur de magasins, sans Home Assistant.

Lancer depuis la racine du repo : python -m unittest discover -s tests/maison
"""

import importlib
import sys
import types
import unittest
from datetime import date, timedelta
from pathlib import Path

import voluptuous as vol

DOSSIER = Path(__file__).resolve().parents[2] / "custom_components" / "maison"
if "maison" not in sys.modules:
    paquet = types.ModuleType("maison")
    paquet.__path__ = [str(DOSSIER)]
    sys.modules["maison"] = paquet
courses = importlib.import_module("maison.courses")

AUJOURDHUI = date(2026, 9, 29)
MAGASINS = ["magasin-a", "magasin-b", "autre"]


def jour(n):
    return (AUJOURDHUI - timedelta(days=n)).isoformat()


def passage(magasin, il_y_a, articles, total=None, ident=None):
    valide = courses.valider_passage(
        {"magasin": magasin, "date": jour(il_y_a), "total": total, "articles": articles}, MAGASINS, AUJOURDHUI)
    return courses.preparer_passage(valide, ident or f"{magasin}-{il_y_a}")


def art(nom, quantite, unite, prix=None):
    return {"nom": nom, "quantite": quantite, "unite": unite, "prix": prix}


class TestMagasins(unittest.TestCase):
    def test_lecture(self):
        m = courses.lire_magasins("Marché du samedi\nÉpicerie, épicerie ; Autre\n\n  Supermarché  ")
        self.assertEqual(m, [{"id": "marche-du-samedi", "nom": "Marché du samedi"},
                             {"id": "epicerie", "nom": "Épicerie"},
                             {"id": "supermarche", "nom": "Supermarché"}])
        self.assertEqual(courses.lire_magasins(None), [])
        self.assertEqual(len(courses.lire_magasins("\n".join(f"M{i}" for i in range(30)))), 12)
        self.assertEqual(courses.avec_autre([])[-1], {"id": "autre", "nom": "Autre"})


class TestValidation(unittest.TestCase):
    def test_valide(self):
        p = passage("magasin-a", 0, [art("Tomates", 1, "kg", 2.5), art("Sel", 1, "piece")], total=12.3)
        self.assertEqual(p["total"], 12.3)
        self.assertEqual(p["articles"][0]["cle"], "tomate")
        self.assertEqual((p["articles"][0]["base"], p["articles"][0]["prix_unitaire"]), ("kg", 2.5))
        self.assertIsNone(p["articles"][1]["prix_unitaire"])

    def test_refus(self):
        base = {"magasin": "magasin-a", "date": jour(0), "articles": [art("Pain", 1, "piece", 1)]}
        for modif in ({"magasin": "inconnu"}, {"date": jour(-1)}, {"date": jour(366)}, {"date": "2026-02-30"},
                      {"total": -1}, {"total": True}, {"articles": []}, {"articles": [art("Pain", 1, "sac", 1)]},
                      {"articles": [art("", 1, "piece", 1)]}, {"articles": [art("Pain", 1, "piece", 10_000)]},
                      {"articles": [art("Pain", 1, "piece", float("nan"))]},
                      {"articles": [art("Pain", 1, "piece", 1)] * 151}):
            with self.subTest(modif=modif):
                with self.assertRaises(vol.Invalid):
                    courses.valider_passage({**base, **modif}, MAGASINS, AUJOURDHUI)
        with self.assertRaises(vol.Invalid):
            courses.valider_passage([], MAGASINS, AUJOURDHUI)

    def test_cles_inconnues_supprimees(self):
        v = courses.valider_passage({"magasin": "autre", "date": jour(0), "pirate": 1,
                                     "articles": [{**art("Pain", 1, "piece", 1), "x": 2}]}, MAGASINS, AUJOURDHUI)
        self.assertNotIn("pirate", v)
        self.assertNotIn("x", v["articles"][0])


class TestPrix(unittest.TestCase):
    def test_bases(self):
        self.assertEqual(courses.prix_par_base(3, 500, "g"), ("kg", 6.0))
        self.assertEqual(courses.prix_par_base(1.5, 75, "cl"), ("l", 2.0))
        self.assertEqual(courses.prix_par_base(2, 4, "piece"), ("piece", 0.5))
        self.assertEqual(courses.prix_par_base(None, 1, "kg"), ("kg", None))
        self.assertEqual(courses.prix_par_base(2, 0, "kg"), ("kg", None))

    def test_retention(self):
        # Un passage de plus d'un an ne peut pas être saisi : il est construit à la main (ancien stockage)
        vieux = {**passage("magasin-a", 300, [art("Pain", 1, "piece", 1)]), "id": "400", "date": jour(400)}
        passages = [passage("magasin-a", n, [art("Pain", 1, "piece", 1)], ident=str(n)) for n in (1, 5)] + [vieux]
        self.assertEqual([p["id"] for p in courses.conserver(passages, AUJOURDHUI)], ["1", "5"])

    def test_derniers_prix(self):
        passages = [
            passage("magasin-a", 10, [art("Tomates", 1, "kg", 2.0)]),
            passage("magasin-a", 2, [art("tomate", 1, "kg", 2.4)]),
            passage("magasin-b", 1, [art("Tomates", 1, "kg", 1.9)]),
        ]
        prix = courses.derniers_prix(passages, "magasin-a", ["Tomates", "Beurre"])
        self.assertEqual(prix["Tomates"]["prix"], 2.4)
        self.assertNotIn("Beurre", prix)


class TestComparateur(unittest.TestCase):
    def historique(self):
        # Magasin A environ 10 % moins cher sur 4 articles achetés régulièrement
        articles_a = [art("Tomates", 1, "kg", 2.7), art("Lait", 1, "l", 0.9), art("Pâtes", 500, "g", 0.9),
                      art("Œufs", 6, "piece", 1.8)]
        articles_b = [art("Tomates", 1, "kg", 3.0), art("Lait", 1, "l", 1.0), art("Pâtes", 500, "g", 1.0),
                      art("Œufs", 6, "piece", 2.0)]
        return [passage("magasin-a", 3, articles_a), passage("magasin-b", 10, articles_b),
                passage("magasin-a", 20, articles_a), passage("autre", 1, [art("Tomates", 1, "kg", 0.1)])]

    def test_meilleur_magasin(self):
        r = courses.comparer(self.historique(), AUJOURDHUI)
        self.assertEqual(r["meilleur"], "magasin-a")
        self.assertEqual(r["second"], "magasin-b")
        self.assertEqual(r["comparables"], 4)
        self.assertAlmostEqual(r["economie_pct"], 10.0, places=1)
        self.assertEqual(r["couverture"], 1.0)
        self.assertGreater(r["economie_euros"], 0)
        # « autre » n'entre jamais dans la comparaison
        self.assertNotIn("autre", [m["id"] for m in r["magasins"]])

    def test_pas_assez_de_donnees(self):
        r = courses.comparer([passage("magasin-a", 1, [art("Pain", 1, "piece", 1)])], AUJOURDHUI)
        self.assertIsNone(r["meilleur"])
        self.assertEqual(r["magasins"], [])

    def test_unites_differentes_non_comparees(self):
        a = [passage("magasin-a", n, [art("Farine", 1, "kg", 1.0)], ident=f"a{n}") for n in (1, 5)]
        b = [passage("magasin-b", n, [art("Farine", 1, "boite", 2.0)], ident=f"b{n}") for n in (2, 6)]
        self.assertEqual(courses.comparer(a + b, AUJOURDHUI)["magasins"], [])

    def test_achats_anciens_hors_panier(self):
        vieux = [passage(m, 120, [art("Riz", 1, "kg", p)], ident=f"{m}-v") for m, p in (("magasin-a", 1), ("magasin-b", 2))]
        self.assertEqual(courses.comparer(vieux, AUJOURDHUI)["panier"], 0)


if __name__ == "__main__":
    unittest.main()
