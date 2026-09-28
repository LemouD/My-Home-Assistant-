"""Tests du menu : normalisation, validation, filtre halal et allergies, liste de courses.

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
menu = importlib.import_module("maison.menu")


def recette(**modifs):
    base = {
        "nom": "Poulet rôti aux légumes",
        "portions": 4,
        "duree_min": 60,
        "ingredients": [
            {"nom": "poulet halal", "quantite": 1200, "unite": "g", "rayon": "boucherie"},
            {"nom": "carottes", "quantite": 500, "unite": "g", "rayon": "fruits-legumes"},
        ],
        "etapes": ["Préchauffer le four.", "Enfourner 1 h."],
        "tags": ["four"],
    }
    base.update(modifs)
    return base


class TestNormalisation(unittest.TestCase):
    # Vecteurs communs avec le panneau (vue Courses) : même résultat attendu des deux côtés
    VECTEURS = {
        "Tomates": "tomate",
        "Pommes de terre": "pomme de terre",
        "Œufs": "oeuf",
        "Riz": "riz",
        "Noix": "noi",
        "Ananas": "anana",
        "Épinards frais": "epinard frai",
        "Crème fraîche": "creme fraiche",
        "Pâtes": "pate",
        "Poireaux": "poireau",
        "  Pois   chiches ": "poi chiche",
        "Cassis": "cassi",            # accepté : même clé au singulier et au pluriel
        "Jus d'orange": "jus d orange",  # mot de 3 lettres : inchangé
    }

    def test_vecteurs(self):
        for entree, attendu in self.VECTEURS.items():
            with self.subTest(entree=entree):
                self.assertEqual(menu.normaliser_nom(entree), attendu)

    def test_note(self):
        self.assertEqual(menu.nettoyer_note("  sans\npiment\t« svp »  "), "sans piment svp")
        self.assertEqual(len(menu.nettoyer_note("x" * 500)), 200)
        self.assertEqual(menu.nettoyer_note(None), "")
        self.assertEqual(menu.nettoyer_note(12), "")


class TestParametres(unittest.TestCase):
    def test_valides(self):
        p = menu.valider_parametres({
            "jours": 3, "repas": ["diner", "jus"], "personnes": 5,
            "preferences": ["rapide", "rapide"], "allergies": ["gluten"], "note": "pas trop épicé\n", "pirate": 1,
        })
        self.assertEqual(p, {"jours": 3, "repas": ["jus", "diner"], "personnes": 5,
                             "preferences": ["rapide"], "allergies": ["gluten"], "note": "pas trop épicé"})

    def test_defauts(self):
        p = menu.valider_parametres({"jours": 1, "repas": ["diner"], "personnes": 2})
        self.assertEqual((p["preferences"], p["allergies"], p["note"]), ([], [], ""))

    def test_refus(self):
        for modif in ({"jours": 0}, {"jours": 8}, {"jours": True}, {"repas": []}, {"repas": ["gouter"]},
                      {"personnes": 13}, {"preferences": ["halal"]}, {"allergies": ["tout"]}, {"repas": "diner"}):
            with self.subTest(modif=modif):
                with self.assertRaises(vol.Invalid):
                    menu.valider_parametres({"jours": 1, "repas": ["diner"], "personnes": 2, **modif})
        with self.assertRaises(vol.Invalid):
            menu.valider_parametres([])


class TestRecette(unittest.TestCase):
    def test_valide(self):
        r = menu.valider_recette({**recette(), "url": "https://exemple.invalid", "video": "x"})
        self.assertNotIn("url", r)
        self.assertNotIn("video", r)
        self.assertEqual(r["portions"], 4)

    def test_unite_et_rayon_inconnus(self):
        r = menu.valider_recette(recette(ingredients=[
            {"nom": "sel", "quantite": 1, "unite": "une pointe", "rayon": "rayon magique"}]))
        self.assertEqual((r["ingredients"][0]["unite"], r["ingredients"][0]["rayon"]), ("autre", "autre"))

    def test_refus(self):
        for modif in ({"nom": ""}, {"nom": "x" * 81}, {"portions": 0}, {"duree_min": 601},
                      {"ingredients": []}, {"etapes": []}, {"etapes": ["a\x00b"]},
                      {"ingredients": [{"nom": "sel", "quantite": -1, "unite": "g", "rayon": "epicerie"}]},
                      {"ingredients": [{"nom": "sel", "quantite": float("nan"), "unite": "g", "rayon": "epicerie"}]},
                      {"ingredients": [{"nom": "sel", "quantite": 1, "unite": "g", "rayon": "epicerie"}] * 31}):
            with self.subTest(modif=modif):
                with self.assertRaises(vol.Invalid):
                    menu.valider_recette(recette(**modif))
        with self.assertRaises(vol.Invalid):
            menu.valider_recette("recette")


class TestConformite(unittest.TestCase):
    def rejet(self, allergies=(), **modif):
        return menu.motif_rejet(menu.valider_recette(recette(**modif)), list(allergies))

    def ingredient(self, nom):
        return {"ingredients": [{"nom": nom, "quantite": 1, "unite": "piece", "rayon": "autre"}]}

    def test_conforme(self):
        self.assertIsNone(self.rejet())

    def test_halal_ingredients(self):
        for nom in ("Lardons fumés", "jambon blanc", "Porc haché", "gélatine", "vin blanc sec",
                    "Bière brune", "chorizo", "Saucisses", "saindoux", "cidre brut"):
            with self.subTest(nom=nom):
                self.assertEqual(self.rejet(**self.ingredient(nom)), "halal")

    def test_halal_precise(self):
        for nom in ("jambon de dinde halal", "lardons de volaille", "gélatine végétale", "gélatine de bœuf halal",
                    "chorizo de boeuf", "vinaigre de vin", "vinaigre de cidre", "saucisses de volaille"):
            with self.subTest(nom=nom):
                self.assertIsNone(self.rejet(**self.ingredient(nom)))

    def test_halal_etapes_et_nom(self):
        self.assertEqual(self.rejet(etapes=["Déglacer au vin blanc."]), "halal")
        self.assertEqual(self.rejet(nom="Rôti de porc"), "halal")
        self.assertIsNone(self.rejet(etapes=["Ajouter un filet de vinaigre de vin."]))

    def test_mots_entiers(self):
        # « vin » ne doit pas toucher « vinaigrette », ni « ham » « hamburger »
        self.assertIsNone(self.rejet(**self.ingredient("vinaigrette")))
        self.assertIsNone(self.rejet(nom="Hamburger maison halal"))

    def test_allergies(self):
        self.assertEqual(self.rejet(["gluten"], **self.ingredient("Farine de blé")), "allergie")
        self.assertEqual(self.rejet(["lactose"], **self.ingredient("crème fraîche")), "allergie")
        self.assertIsNone(self.rejet(["lactose"], **self.ingredient("lait de coco")))
        self.assertEqual(self.rejet(["fruits-a-coque"], **self.ingredient("Noix de cajou")), "allergie")
        self.assertIsNone(self.rejet(["fruits-a-coque"], **self.ingredient("noix de coco râpée")))
        self.assertEqual(self.rejet(["sesame"], etapes=["Parsemer de graines de sésame."]), "allergie")
        self.assertIsNone(self.rejet(["gluten"]))

    def test_halal_prioritaire(self):
        self.assertEqual(self.rejet(["gluten"], **self.ingredient("Pain au jambon")), "halal")


class TestCourses(unittest.TestCase):
    def test_fusion(self):
        r1 = menu.valider_recette(recette())
        r2 = menu.valider_recette(recette(ingredients=[
            {"nom": "Carotte", "quantite": 250, "unite": "g", "rayon": "fruits-legumes"},
            {"nom": "carottes", "quantite": 2, "unite": "piece", "rayon": "fruits-legumes"},
            {"nom": "!!!", "quantite": 1, "unite": "g", "rayon": "autre"},
        ]))
        lignes, ignores = menu.lignes_courses([r1, r2])
        par_cle = {(l["cle"], l["unite"]): l for l in lignes}
        self.assertEqual(par_cle[("carotte", "g")]["quantite"], 750)
        self.assertEqual(par_cle[("carotte", "piece")]["quantite"], 2)
        self.assertEqual(par_cle[("carotte", "g")]["nom"], "Carottes")
        self.assertEqual(ignores, 1)

    def test_description(self):
        d = menu.description_article(500, "g", "fruits-legumes")
        self.assertEqual(d, "qte=500;unite=g;rayon=fruits-legumes;source=menu")
        self.assertEqual(menu.lire_description(d), {"quantite": 500.0, "unite": "g", "rayon": "fruits-legumes", "source": "menu"})
        self.assertEqual(menu.description_article(1.25, "l", "boissons", "manuel"), "qte=1.25;unite=l;rayon=boissons;source=manuel")
        for invalide in ("qte=1;unite=g", "qte=abc;unite=g;rayon=autre;source=menu",
                         "qte=1;unite=g;rayon=cave;source=menu", "qte=1;unite=g;rayon=autre;source=menu;x=1", None, 3):
            with self.subTest(invalide=invalide):
                self.assertIsNone(menu.lire_description(invalide))

    def test_titre(self):
        self.assertEqual(menu.titre_article("Tomates", 500, "g"), "Tomates — 500 g")
        self.assertEqual(menu.titre_article("Œufs", 6, "piece"), "Œufs — 6 pièce(s)")
        self.assertEqual(menu.titre_article("Sel", 1, "autre"), "Sel — 1")
        self.assertEqual(menu.titre_article("Sel", 0, "pincee"), "Sel")
        self.assertEqual(menu.nom_article("Tomates — 500 g"), "Tomates")
        self.assertEqual(menu.nom_article("Tomates"), "Tomates")


class TestReglages(unittest.TestCase):
    def test_url_generateur(self):
        self.assertTrue(menu.url_generateur_valide("https://mon-menu-ia.exemple.workers.dev"))
        for url in ("http://mon-menu-ia.exemple.workers.dev", "https://", "https://moi:mdp@exemple.dev",
                    "ftp://exemple.dev", "javascript:alert(1)", "", None, 42, "https://[::1"):
            with self.subTest(url=url):
                self.assertFalse(menu.url_generateur_valide(url))


if __name__ == "__main__":
    unittest.main()
