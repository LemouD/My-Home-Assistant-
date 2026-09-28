"""Dernières courses et comparateur de magasins, à partir des achats saisis par la famille.

Module sans dépendance à Home Assistant : testable seul (tests/maison/).
Aucune donnée externe : les prix viennent uniquement des passages enregistrés.
"""

from __future__ import annotations

import math
import re
import statistics
from datetime import date, timedelta

import voluptuous as vol

from .const import UNITES
from .menu import normaliser_nom

MAGASIN_AUTRE = "autre"          # toujours proposé, exclu du comparateur
MAGASINS_MAX = 12
RETENTION_JOURS = 365
PASSAGES_MAX = 500
FENETRE_PANIER_JOURS = 90        # articles achetés au moins 2 fois sur cette période
ACHATS_MIN_PANIER = 2
COMPARABLES_MIN = 3              # en dessous, pas de « meilleur magasin »

# Unité → (unité de base, facteur) : les prix sont comparés par kg, par litre ou par pièce
_BASES = {"g": ("kg", 0.001), "kg": ("kg", 1.0), "ml": ("l", 0.001), "cl": ("l", 0.01), "l": ("l", 1.0)}


# ---- MAGASINS (options de l'intégration) ----


def identifiant_magasin(nom: str) -> str:
    """« Marché du samedi » → « marche-du-samedi »."""
    return normaliser_nom(nom).replace(" ", "-")[:40]


def lire_magasins(texte: object) -> list[dict]:
    """Saisie de l'admin (un nom par ligne ou séparés par des virgules) → [{id, nom}], sans doublon."""
    if not isinstance(texte, str):
        return []
    magasins, vus = [], {MAGASIN_AUTRE}
    for nom in re.split(r"[\n,;]", texte):
        nom = re.sub(r"[\x00-\x1f\x7f]", " ", nom)
        nom = re.sub(r"\s+", " ", nom).strip()[:40]
        ident = identifiant_magasin(nom)
        if ident and ident not in vus:
            vus.add(ident)
            magasins.append({"id": ident, "nom": nom})
    return magasins[:MAGASINS_MAX]


def avec_autre(magasins: list[dict]) -> list[dict]:
    return [*magasins, {"id": MAGASIN_AUTRE, "nom": "Autre"}]


# ---- VALIDATION D'UN PASSAGE ----


def _texte(maximum: int):
    def valider(valeur: object) -> str:
        if not isinstance(valeur, str):
            raise vol.Invalid("texte attendu")
        valeur = re.sub(r"\s+", " ", valeur).strip()
        if not 1 <= len(valeur) <= maximum or any(ord(c) < 32 or ord(c) == 127 for c in valeur):
            raise vol.Invalid(f"texte de 1 à {maximum} caractères attendu")
        return valeur
    return valider


def _nombre(maximum: float):
    def valider(valeur: object) -> float:
        if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
            raise vol.Invalid("nombre attendu")
        if not math.isfinite(valeur) or not 0 <= valeur <= maximum:
            raise vol.Invalid(f"nombre hors limites (0 à {maximum})")
        return round(float(valeur), 3)
    return valider


def _date_recente(aujourdhui: date):
    def valider(valeur: object) -> str:
        if not isinstance(valeur, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valeur):
            raise vol.Invalid("date AAAA-MM-JJ attendue")
        try:
            jour = date.fromisoformat(valeur)
        except ValueError as err:
            raise vol.Invalid("date inexistante") from err
        if jour > aujourdhui or jour < aujourdhui - timedelta(days=RETENTION_JOURS):
            raise vol.Invalid("date hors de la dernière année")
        return valeur
    return valider


def valider_passage(passage: object, magasins: list[str], aujourdhui: date) -> dict:
    """`magasins` : identifiants autorisés (« autre » compris). Lève vol.Invalid."""
    if not isinstance(passage, dict):
        raise vol.Invalid("objet attendu")
    article = vol.Schema({
        vol.Required("nom"): _texte(60),
        vol.Required("quantite"): _nombre(10_000),
        vol.Required("unite"): vol.In(UNITES),
        vol.Optional("prix"): vol.Any(None, _nombre(9_999)),
    }, extra=vol.REMOVE_EXTRA)
    return vol.Schema({
        vol.Required("magasin"): vol.In(magasins),
        vol.Required("date"): _date_recente(aujourdhui),
        vol.Optional("total"): vol.Any(None, _nombre(100_000)),
        vol.Required("articles"): vol.All(list, vol.Length(min=1, max=150), [article]),
    }, extra=vol.REMOVE_EXTRA)(passage)


def preparer_passage(valide: dict, identifiant: str) -> dict:
    """Passage à stocker : chaque article reçoit sa clé de comparaison et son prix unitaire."""
    articles = []
    for a in valide["articles"]:
        cle = normaliser_nom(a["nom"])
        if not cle:
            continue
        base, prix_unitaire = prix_par_base(a.get("prix"), a["quantite"], a["unite"])
        articles.append({**a, "cle": cle, "base": base, "prix_unitaire": prix_unitaire})
    return {"id": identifiant, "magasin": valide["magasin"], "date": valide["date"],
            "total": valide.get("total"), "articles": articles}


# ---- PRIX ----


def prix_par_base(prix: float | None, quantite: float, unite: str) -> tuple[str, float | None]:
    """(unité de base, prix par unité de base) ; prix None si inconnu ou quantité nulle."""
    base, facteur = _BASES.get(unite, (unite, 1.0))
    if prix is None or quantite <= 0:
        return base, None
    return base, round(prix / (quantite * facteur), 4)


def conserver(passages: list[dict], aujourdhui: date) -> list[dict]:
    """Rétention : 365 jours et PASSAGES_MAX passages, les plus récents d'abord."""
    limite = (aujourdhui - timedelta(days=RETENTION_JOURS)).isoformat()
    gardes = [p for p in passages if p["date"] >= limite]
    gardes.sort(key=lambda p: (p["date"], p["id"]), reverse=True)
    return gardes[:PASSAGES_MAX]


def derniers_prix(passages: list[dict], magasin: str, cles: list[str]) -> dict[str, dict]:
    """Dernier prix connu dans ce magasin pour chaque nom demandé (pour pré-remplir la saisie)."""
    voulues = {normaliser_nom(c): c for c in cles}
    trouves: dict[str, dict] = {}
    for p in sorted(passages, key=lambda p: p["date"], reverse=True):
        if p["magasin"] != magasin:
            continue
        for a in p["articles"]:
            if a["cle"] in voulues and a.get("prix") is not None and voulues[a["cle"]] not in trouves:
                trouves[voulues[a["cle"]]] = {"prix": a["prix"], "quantite": a["quantite"],
                                              "unite": a["unite"], "date": p["date"]}
    return trouves


# ---- COMPARATEUR ----


def comparer(passages: list[dict], aujourdhui: date) -> dict:
    """Compare les magasins sur le panier habituel de la famille, au dernier prix connu.

    indice d'un magasin = moyenne géométrique de (son prix / prix moyen des magasins) sur les
    articles qu'il partage avec au moins un autre magasin : 0,91 = 9 % moins cher que la moyenne.
    """
    debut = (aujourdhui - timedelta(days=FENETRE_PANIER_JOURS)).isoformat()
    recents = [p for p in passages if p["date"] >= debut]

    # Panier : (clé, base) achetés au moins 2 fois sur 90 jours, tous magasins confondus
    achats: dict[tuple[str, str], list[float]] = {}
    for p in recents:
        for a in p["articles"]:
            achats.setdefault((a["cle"], a["base"]), []).append(a["quantite"] * _BASES.get(a["unite"], ("", 1.0))[1])
    panier = {k for k, v in achats.items() if len(v) >= ACHATS_MIN_PANIER}

    # Dernier prix unitaire connu par magasin (hors « autre ») pour chaque article du panier
    prix: dict[tuple[str, str], dict[str, float]] = {}
    for p in sorted(passages, key=lambda p: p["date"], reverse=True):
        if p["magasin"] == MAGASIN_AUTRE:
            continue
        for a in p["articles"]:
            cle = (a["cle"], a["base"])
            if cle in panier and a.get("prix_unitaire"):
                prix.setdefault(cle, {}).setdefault(p["magasin"], a["prix_unitaire"])

    ratios: dict[str, list[float]] = {}
    for par_magasin in prix.values():
        if len(par_magasin) < 2:
            continue
        moyenne = statistics.fmean(par_magasin.values())
        for magasin, valeur in par_magasin.items():
            ratios.setdefault(magasin, []).append(valeur / moyenne)

    magasins = sorted(
        ({"id": m, "indice": round(statistics.geometric_mean(r), 3), "articles_comparables": len(r)}
         for m, r in ratios.items()),
        key=lambda m: m["indice"],
    )
    resultat = {"panier": len(panier), "magasins": magasins, "meilleur": None, "second": None,
                "comparables": 0, "economie_pct": None, "economie_euros": None, "couverture": None}
    eligibles = [m for m in magasins if m["articles_comparables"] >= COMPARABLES_MIN]
    if len(eligibles) < 2:
        return resultat

    meilleur, second = eligibles[0]["id"], eligibles[1]["id"]
    communs = [(cle, v) for cle, v in prix.items() if meilleur in v and second in v]
    if len(communs) < COMPARABLES_MIN:
        return resultat
    cout_meilleur = sum(v[meilleur] * statistics.fmean(achats[cle]) for cle, v in communs)
    cout_second = sum(v[second] * statistics.fmean(achats[cle]) for cle, v in communs)
    resultat.update(
        meilleur=meilleur,
        second=second,
        comparables=len(communs),
        economie_pct=round((1 - cout_meilleur / cout_second) * 100, 1) if cout_second else None,
        economie_euros=round(cout_second - cout_meilleur, 2),
        couverture=round(len(communs) / len(panier), 2) if panier else None,
    )
    return resultat
