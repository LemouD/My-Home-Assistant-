"""Code d'accès, anti force brute et sessions.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from collections.abc import Callable

from .const import (
    BLOCAGE_INITIAL,
    BLOCAGE_MAX,
    DUREE_SESSION,
    DUREE_SESSION_MAX,
    ESSAIS_MAX,
    ITERATIONS_PBKDF2,
    SESSIONS_MAX,
)

# [0-9] et non \d : \d accepte aussi les chiffres d'autres écritures (٠١٢…)
FORMAT_CODE = re.compile(r"[0-9]{6}")


def code_valide(code: object) -> bool:
    """Le code fait exactement 6 chiffres."""
    return isinstance(code, str) and FORMAT_CODE.fullmatch(code) is not None


def code_faible(code: str) -> bool:
    """Codes devinés en premier : 000000, 123456, 654321, 121212, 123123…"""
    chiffres = [int(c) for c in code]
    ecarts = {b - a for a, b in zip(chiffres, chiffres[1:])}
    return (
        len(ecarts) == 1 and ecarts <= {-1, 0, 1}   # répété ou suite
        or code[:2] * 3 == code                      # motif de 2 chiffres
        or code[:3] * 2 == code                      # motif de 3 chiffres
    )


def hacher_code(code: str, iterations: int = ITERATIONS_PBKDF2) -> dict:
    """Empreinte PBKDF2-SHA256 salée : le code lui-même n'est jamais stocké.

    Calcul volontairement lent : à exécuter hors de la boucle d'événements.
    """
    sel = secrets.token_bytes(16)
    empreinte = hashlib.pbkdf2_hmac("sha256", code.encode(), sel, iterations)
    return {"sel": sel.hex(), "empreinte": empreinte.hex(), "iterations": iterations}


def verifier_code(code: object, stocke: dict) -> bool:
    """Compare en temps constant le code saisi à l'empreinte stockée."""
    if not code_valide(code):
        return False
    calcule = hashlib.pbkdf2_hmac(
        "sha256", code.encode(), bytes.fromhex(stocke["sel"]), stocke["iterations"]
    )
    return hmac.compare_digest(calcule.hex(), stocke["empreinte"])


class Verrou:
    """Bloque les essais après trop d'échecs, avec une durée qui double à chaque blocage.

    Un seul verrou pour tous les utilisateurs : multiplier les comptes n'apporte pas d'essais.
    Horloge murale (et non monotone) pour que l'état survive à un redémarrage de HA.
    """

    def __init__(
        self,
        essais_max: int = ESSAIS_MAX,
        blocage_initial: int = BLOCAGE_INITIAL,
        blocage_max: int = BLOCAGE_MAX,
        horloge: Callable[[], float] = time.time,
    ) -> None:
        self._essais_max = essais_max
        self._blocage_initial = blocage_initial
        self._blocage_max = blocage_max
        self._horloge = horloge
        self._echecs = 0
        self._blocages = 0
        self._bloque_jusqua = 0.0

    def attente(self) -> int:
        """Secondes restantes avant de pouvoir réessayer (0 si non bloqué)."""
        return max(0, round(self._bloque_jusqua - self._horloge()))

    def essais_restants(self) -> int:
        return self._essais_max - self._echecs

    def echec(self) -> bool:
        """Compte un échec. Renvoie vrai si cet échec déclenche un blocage."""
        self._echecs += 1
        if self._echecs < self._essais_max:
            return False
        duree = min(self._blocage_initial * 2**self._blocages, self._blocage_max)
        self._bloque_jusqua = self._horloge() + duree
        self._blocages += 1
        self._echecs = 0
        return True

    def succes(self) -> None:
        self._echecs = 0
        self._blocages = 0

    def exporter(self) -> dict:
        return {
            "echecs": self._echecs,
            "blocages": self._blocages,
            "bloque_jusqua": self._bloque_jusqua,
        }

    def restaurer(self, etat: dict | None) -> None:
        if not etat:
            return
        self._echecs = int(etat.get("echecs", 0))
        self._blocages = int(etat.get("blocages", 0))
        self._bloque_jusqua = float(etat.get("bloque_jusqua", 0))


class Sessions:
    """Jetons remis après saisie du bon code, liés à un utilisateur HA.

    En mémoire uniquement : un redémarrage de HA ferme toutes les sessions.
    """

    def __init__(
        self,
        duree: int = DUREE_SESSION,
        duree_max: int = DUREE_SESSION_MAX,
        nombre_max: int = SESSIONS_MAX,
        horloge: Callable[[], float] = time.monotonic,
    ) -> None:
        self._duree = duree
        self._duree_max = duree_max
        self._nombre_max = nombre_max
        self._horloge = horloge
        # jeton → (utilisateur, expiration par inactivité, expiration absolue)
        self._sessions: dict[str, tuple[str, float, float]] = {}

    @property
    def duree(self) -> int:
        """Durée d'inactivité avant fermeture, en secondes."""
        return self._duree

    def ouvrir(self, utilisateur: str) -> str:
        self._purger()
        # Au-delà du plafond, la session la plus ancienne est fermée
        while len(self._sessions) >= self._nombre_max:
            del self._sessions[next(iter(self._sessions))]
        maintenant = self._horloge()
        jeton = secrets.token_urlsafe(32)
        self._sessions[jeton] = (utilisateur, maintenant + self._duree, maintenant + self._duree_max)
        return jeton

    def valider(self, jeton: object, utilisateur: str) -> bool:
        """Vrai si le jeton est valide pour cet utilisateur ; prolonge alors la session."""
        if not isinstance(jeton, str):
            return False
        session = self._sessions.get(jeton)
        if session is None:
            return False
        proprietaire, inactivite, absolue = session
        maintenant = self._horloge()
        if maintenant >= min(inactivite, absolue):
            del self._sessions[jeton]
            return False
        if not hmac.compare_digest(proprietaire, utilisateur):
            return False
        self._sessions[jeton] = (proprietaire, min(maintenant + self._duree, absolue), absolue)
        return True

    def fermer(self, jeton: object) -> None:
        if isinstance(jeton, str):
            self._sessions.pop(jeton, None)

    def fermer_tout(self) -> None:
        self._sessions.clear()

    def _purger(self) -> None:
        maintenant = self._horloge()
        for jeton in [j for j, (_, ina, abs_) in self._sessions.items() if maintenant >= min(ina, abs_)]:
            del self._sessions[jeton]
