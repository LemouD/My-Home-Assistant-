"""Tests du code d'accès, de l'anti force brute et des sessions, sans Home Assistant.

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
securite = importlib.import_module("maison.securite")


class Horloge:
    """Horloge manipulable pour tester les durées sans attendre."""

    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


class TestCode(unittest.TestCase):
    def test_format(self):
        self.assertTrue(securite.code_valide("482915"))
        for code in ("48291", "4829150", "48291a", " 482915", "", None, 482915, "٤٨٢٩١٥"):
            with self.subTest(code=code):
                self.assertFalse(securite.code_valide(code))

    def test_codes_faibles(self):
        for code in ("000000", "999999", "123456", "654321", "234567", "121212", "123123", "907907"):
            with self.subTest(code=code):
                self.assertTrue(securite.code_faible(code))
        for code in ("482915", "190482", "112358"):
            with self.subTest(code=code):
                self.assertFalse(securite.code_faible(code))

    def test_empreinte(self):
        stocke = securite.hacher_code("482915", iterations=1000)
        self.assertNotIn("482915", str(stocke))
        self.assertTrue(securite.verifier_code("482915", stocke))
        self.assertFalse(securite.verifier_code("482916", stocke))
        self.assertFalse(securite.verifier_code(None, stocke))
        self.assertFalse(securite.verifier_code("abc", stocke))

    def test_sel_unique(self):
        a = securite.hacher_code("482915", iterations=1000)
        b = securite.hacher_code("482915", iterations=1000)
        self.assertNotEqual(a["sel"], b["sel"])
        self.assertNotEqual(a["empreinte"], b["empreinte"])


class TestVerrou(unittest.TestCase):
    def setUp(self):
        self.horloge = Horloge()
        self.verrou = securite.Verrou(essais_max=3, blocage_initial=60, blocage_max=200, horloge=self.horloge)

    def echouer(self, n):
        return [self.verrou.echec() for _ in range(n)]

    def test_blocage_apres_essais_max(self):
        self.assertEqual(self.echouer(3), [False, False, True])
        self.assertEqual(self.verrou.attente(), 60)
        self.assertEqual(self.verrou.essais_restants(), 3)

    def test_duree_double_puis_plafonne(self):
        attentes = []
        for _ in range(4):
            self.echouer(3)
            attentes.append(self.verrou.attente())
            self.horloge.t += 1000
        self.assertEqual(attentes, [60, 120, 200, 200])

    def test_succes_remet_a_zero(self):
        self.echouer(3)
        self.horloge.t += 100
        self.verrou.succes()
        self.echouer(3)
        self.assertEqual(self.verrou.attente(), 60)

    def test_fin_du_blocage(self):
        self.echouer(3)
        self.horloge.t += 60
        self.assertEqual(self.verrou.attente(), 0)

    def test_etat_survit_au_redemarrage(self):
        self.echouer(3)
        self.echouer(1)
        nouveau = securite.Verrou(essais_max=3, blocage_initial=60, blocage_max=200, horloge=self.horloge)
        nouveau.restaurer(self.verrou.exporter())
        self.assertEqual(nouveau.attente(), 60)
        self.assertEqual(nouveau.essais_restants(), 2)
        self.horloge.t += 1000
        nouveau.echec(), nouveau.echec()
        self.assertEqual(nouveau.attente(), 120)

    def test_restaurer_vide(self):
        self.verrou.restaurer(None)
        self.assertEqual(self.verrou.attente(), 0)


class TestSessions(unittest.TestCase):
    def setUp(self):
        self.horloge = Horloge()
        self.sessions = securite.Sessions(duree=600, duree_max=3600, nombre_max=3, horloge=self.horloge)

    def test_jeton_lie_a_l_utilisateur(self):
        jeton = self.sessions.ouvrir("tablette")
        self.assertTrue(self.sessions.valider(jeton, "tablette"))
        self.assertFalse(self.sessions.valider(jeton, "autre"))

    def test_jeton_inconnu_ou_mal_forme(self):
        self.assertFalse(self.sessions.valider("inconnu", "tablette"))
        self.assertFalse(self.sessions.valider(None, "tablette"))
        self.assertFalse(self.sessions.valider(["x"], "tablette"))

    def test_expiration_par_inactivite(self):
        jeton = self.sessions.ouvrir("tablette")
        self.horloge.t += 600
        self.assertFalse(self.sessions.valider(jeton, "tablette"))

    def test_activite_prolonge(self):
        jeton = self.sessions.ouvrir("tablette")
        self.horloge.t += 500
        self.assertTrue(self.sessions.valider(jeton, "tablette"))
        self.horloge.t += 500
        self.assertTrue(self.sessions.valider(jeton, "tablette"))

    def test_duree_absolue(self):
        jeton = self.sessions.ouvrir("tablette")
        # Activité toutes les 500 s : la session reste ouverte jusqu'à la limite absolue de 3600 s
        for _ in range(7):
            self.horloge.t += 500
            self.assertTrue(self.sessions.valider(jeton, "tablette"))
        self.horloge.t += 100
        self.assertFalse(self.sessions.valider(jeton, "tablette"))

    def test_nombre_plafonne(self):
        jetons = [self.sessions.ouvrir("tablette") for _ in range(4)]
        self.assertFalse(self.sessions.valider(jetons[0], "tablette"))
        self.assertTrue(all(self.sessions.valider(j, "tablette") for j in jetons[1:]))

    def test_fermer(self):
        a, b = self.sessions.ouvrir("tablette"), self.sessions.ouvrir("admin")
        self.sessions.fermer(a)
        self.assertFalse(self.sessions.valider(a, "tablette"))
        self.assertTrue(self.sessions.valider(b, "admin"))
        self.sessions.fermer_tout()
        self.assertFalse(self.sessions.valider(b, "admin"))

    def test_jetons_uniques(self):
        self.assertEqual(len({self.sessions.ouvrir("tablette") for _ in range(3)}), 3)


if __name__ == "__main__":
    unittest.main()
