"""Tests des jus, du conseil météo et des contrôles de photos, sans Home Assistant.

Lancer depuis la racine du repo : python -m unittest discover -s tests/maison
"""

import importlib
import os
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path

import voluptuous as vol

DOSSIER = Path(__file__).resolve().parents[2] / "custom_components" / "maison"
if "maison" not in sys.modules:
    paquet = types.ModuleType("maison")
    paquet.__path__ = [str(DOSSIER)]
    sys.modules["maison"] = paquet
menu = importlib.import_module("maison.menu")
photos_disque = importlib.import_module("maison.photos_disque")


def jus(**modifs):
    base = {
        "nom": "Smoothie mangue passion",
        "portions": 2,
        "duree_min": 5,
        "ingredients": [{"nom": "mangue", "quantite": 1, "unite": "piece", "rayon": "fruits-legumes"}],
        "etapes": ["Mixer."],
        "photo_requete": "mango smoothie",
        "jus": {"objectif": "fraicheur", "moment": "matin", "description": "Doux et frais.", "service": "Bien frais."},
    }
    base.update(modifs)
    return base


class TestJus(unittest.TestCase):
    def test_valide(self):
        r = menu.valider_recette(jus(), jus=True)
        self.assertEqual(r["jus"]["objectif"], "fraicheur")

    def test_jus_obligatoire_pour_le_catalogue(self):
        sans = {k: v for k, v in jus().items() if k != "jus"}
        menu.valider_recette(sans)
        with self.assertRaises(vol.Invalid):
            menu.valider_recette(sans, jus=True)

    def test_objectif_et_moment(self):
        with self.assertRaises(vol.Invalid):
            menu.valider_recette(jus(jus={"objectif": "detox", "moment": "matin", "description": "a", "service": "b"}), jus=True)
        r = menu.valider_recette(jus(jus={"objectif": "digestif", "moment": "nuit", "description": "a", "service": "b"}), jus=True)
        self.assertEqual(r["jus"]["moment"], "matin")   # moment inconnu : valeur par défaut

    def test_alcool_refuse(self):
        recette, motif = menu.evaluer_plat(jus(ingredients=[
            {"nom": "rhum blanc", "quantite": 2, "unite": "cl", "rayon": "boissons"}]), [], jus=True)
        self.assertIsNone(recette)
        self.assertEqual(motif, "halal")

    def test_photo_requete_nettoyee(self):
        r = menu.valider_recette(jus(photo_requete="mango <b>smoothie</b> https://x.dev/?q=1 " + "a" * 80))
        self.assertRegex(r["photo_requete"], r"^[A-Za-z ]{0,60}$")
        self.assertNotIn("<", r["photo_requete"])


class TestMeteo(unittest.TestCase):
    def test_regles(self):
        self.assertEqual(menu.conseil_meteo("sunny", 20)["objectif"], "fraicheur")
        self.assertEqual(menu.conseil_meteo("cloudy", 26)["objectif"], "fraicheur")
        self.assertEqual(menu.conseil_meteo("rainy", 15)["objectif"], "immunite")
        self.assertEqual(menu.conseil_meteo("partlycloudy", 5)["objectif"], "immunite")
        self.assertEqual(menu.conseil_meteo("cloudy", 15)["objectif"], "vitalite")
        self.assertEqual(menu.conseil_meteo("clear-night", 15)["objectif"], "antioxydant")

    def test_texte(self):
        self.assertEqual(menu.conseil_meteo("sunny", 24.4)["texte"], "24 °C, ciel dégagé → privilégiez la fraîcheur")
        self.assertEqual(menu.conseil_meteo(None, None)["texte"], "Privilégiez les antioxydants")
        self.assertIsNone(menu.conseil_meteo("sunny", "chaud")["temperature"])


class TestPhotos(unittest.TestCase):
    def test_origine_autorisee(self):
        self.assertTrue(menu.url_image_autorisee("https://images.pexels.com/photos/1/a.jpeg?w=940"))
        for url in ("http://images.pexels.com/a.jpg", "https://images.pexels.com.evil.dev/a.jpg",
                    "https://evil.dev/images.pexels.com/a.jpg", "https://user@images.pexels.com/a.jpg",
                    "https://images.pexels.com:8443/a.jpg", "https://127.0.0.1/a.jpg", "file:///etc/passwd",
                    "https://images.pexels.com/" + "a" * 600, None, 3):
            with self.subTest(url=url):
                self.assertFalse(menu.url_image_autorisee(url))

    def test_credit(self):
        self.assertEqual(menu.credit_photo("Ana\nB", "https://www.pexels.com/photo/1/"),
                         {"auteur": "Ana B", "lien": "https://www.pexels.com/photo/1/"})
        self.assertEqual(menu.credit_photo(None, "https://evil.dev/"), {"auteur": "Pexels", "lien": None})
        self.assertIsNone(menu.credit_photo("x", "javascript:alert(1)")["lien"])

    def test_signature_binaire(self):
        self.assertEqual(menu.type_image(b"\xff\xd8\xff\xe0" + b"0" * 12), "jpeg")
        self.assertEqual(menu.type_image(b"\x89PNG\r\n\x1a\n" + b"0" * 8), "png")
        self.assertEqual(menu.type_image(b"RIFF\x00\x00\x00\x00WEBPVP8 "), "webp")
        self.assertIsNone(menu.type_image(b"<svg xmlns=...>"))
        self.assertIsNone(menu.type_image(b"<html><script>"))


class TestPurge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.racine = Path(self.tmp.name)
        self.dossier = self.racine / "photos"
        self.dossier.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def creer(self, nom, taille=10, age=0):
        f = self.dossier / nom
        f.write_bytes(b"x" * taille)
        os.utime(f, (time.time() - age, time.time() - age))
        return f

    def test_garde_et_supprime(self):
        garde = self.creer("0123456789abcdef.webp")
        inutile = self.creer("fedcba9876543210.webp")
        photos_disque.purger_dossier(self.dossier, {"0123456789abcdef"}, 10_000)
        self.assertTrue(garde.exists())
        self.assertFalse(inutile.exists())

    def test_ne_touche_qu_a_ses_fichiers(self):
        autres = [self.creer(n) for n in ("notes.txt", "0123456789abcdef.jpg", "ABCDEF0123456789.webp", "court.webp")]
        dehors = self.racine / "fedcba9876543210.webp"
        dehors.write_bytes(b"x")
        photos_disque.purger_dossier(self.dossier, set(), 10_000)
        self.assertTrue(all(f.exists() for f in autres))
        self.assertTrue(dehors.exists())

    def test_plafond_supprime_les_plus_anciennes(self):
        vieille = self.creer("aaaaaaaaaaaaaaaa.webp", 60, age=100)
        recente = self.creer("bbbbbbbbbbbbbbbb.webp", 60, age=1)
        photos_disque.purger_dossier(self.dossier, {"aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"}, 100)
        self.assertFalse(vieille.exists())
        self.assertTrue(recente.exists())

    def test_dossier_absent(self):
        photos_disque.purger_dossier(self.racine / "absent", set(), 0)


if __name__ == "__main__":
    unittest.main()
