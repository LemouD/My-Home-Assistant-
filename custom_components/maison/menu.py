"""Menu : validation des recettes générées, filtre halal et allergies, liste de courses.

Dépend seulement de voluptuous (fourni avec Home Assistant) : testable seul (tests/maison/).
Tout ce qui vient du générateur est considéré comme non fiable et revalidé ici.
"""

from __future__ import annotations

import math
import re
import unicodedata
from urllib.parse import urlsplit

import voluptuous as vol

from .const import (
    ALLERGIES,
    HOTE_IMAGES,
    HOTES_CREDIT,
    MOMENTS_JUS,
    NOTE_MAX,
    OBJECTIFS_JUS,
    PREFERENCES,
    RAYONS,
    REPAS,
    UNITES,
)

# ---- NORMALISATION DES NOMS ----
# Règle commune avec le panneau (vue Courses) : toute modification doit être faite des deux côtés.


def normaliser_nom(texte: str) -> str:
    """« Pommes de terre » → « pomme de terre » ; « Œufs » → « oeuf ».

    1) œ → oe, æ → ae ; 2) décomposition NFD et suppression des accents ; 3) minuscules ;
    4) tout sauf [a-z0-9] → espace ; 5) espaces réduits ; 6) mot de plus de 3 lettres
    finissant par « s » ou « x » (mais pas « ss ») : dernière lettre retirée.
    """
    texte = texte.replace("œ", "oe").replace("Œ", "Oe").replace("æ", "ae").replace("Æ", "Ae")
    texte = "".join(c for c in unicodedata.normalize("NFD", texte) if not unicodedata.combining(c))
    texte = re.sub(r"[^a-z0-9]+", " ", texte.lower()).strip()
    mots = [
        m[:-1] if len(m) > 3 and m[-1] in "sx" and not m.endswith("ss") else m
        for m in texte.split()
    ]
    return " ".join(mots)


def nettoyer_note(texte: object) -> str:
    """Texte libre envoyé au générateur : une ligne, sans caractère de contrôle, borné."""
    if not isinstance(texte, str):
        return ""
    texte = re.sub(r"[\x00-\x1f\x7f«»\"]", " ", texte)
    return re.sub(r"\s+", " ", texte).strip()[:NOTE_MAX]


# ---- VALIDATION ----


def _texte(maximum: int):
    def valider(valeur: object) -> str:
        if not isinstance(valeur, str):
            raise vol.Invalid("texte attendu")
        valeur = re.sub(r"\s+", " ", valeur).strip()
        if not 1 <= len(valeur) <= maximum:
            raise vol.Invalid(f"texte de 1 à {maximum} caractères attendu")
        if any(ord(c) < 32 or ord(c) == 127 for c in valeur):
            raise vol.Invalid("caractères de contrôle interdits")
        return valeur
    return valider


def _nombre(minimum: float, maximum: float, entier: bool = False):
    def valider(valeur: object) -> float:
        # bool est un sous-type d'int en Python : refusé explicitement
        if isinstance(valeur, bool) or not isinstance(valeur, (int, float)):
            raise vol.Invalid("nombre attendu")
        if not math.isfinite(valeur) or not minimum <= valeur <= maximum:
            raise vol.Invalid(f"nombre hors limites ({minimum} à {maximum})")
        if entier:
            return int(round(valeur))
        return round(float(valeur), 3)
    return valider


def _dans(liste: tuple[str, ...], defaut: str | None = None):
    """Valeur d'une liste fermée ; hors liste : `defaut` si fourni, sinon refus."""
    def valider(valeur: object) -> str:
        if isinstance(valeur, str) and valeur in liste:
            return valeur
        if defaut is not None:
            return defaut
        raise vol.Invalid(f"valeur hors liste : {valeur!r}")
    return valider


def _liste(element, minimum: int, maximum: int):
    return vol.All(list, vol.Length(min=minimum, max=maximum), [element])


def _objet(champs: dict) -> vol.Schema:
    return vol.Schema(champs, extra=vol.REMOVE_EXTRA)


INGREDIENT = _objet({
    vol.Required("nom"): _texte(60),
    vol.Required("quantite"): _nombre(0, 10_000),
    # Unité ou rayon inconnus : rangés en « autre » plutôt que de perdre la recette
    vol.Required("unite"): _dans(UNITES, "autre"),
    vol.Required("rayon"): _dans(RAYONS, "autre"),
})

def _requete_photo(valeur: object) -> str:
    """Mots-clés de recherche de photo : lettres latines et espaces uniquement, 60 caractères max."""
    if not isinstance(valeur, str):
        raise vol.Invalid("texte attendu")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z ]", " ", valeur)).strip()[:60]


INFOS_JUS = _objet({
    vol.Required("objectif"): _dans(OBJECTIFS_JUS),
    vol.Required("moment"): _dans(MOMENTS_JUS, "matin"),
    vol.Required("description"): _texte(200),
    vol.Required("service"): _texte(200),
})

RECETTE = _objet({
    vol.Required("nom"): _texte(80),
    vol.Required("portions"): _nombre(1, 12, entier=True),
    vol.Required("duree_min"): _nombre(1, 600, entier=True),
    vol.Required("ingredients"): _liste(INGREDIENT, 1, 30),
    vol.Required("etapes"): _liste(_texte(500), 1, 30),
    vol.Optional("tags", default=list): _liste(_texte(30), 0, 10),
    vol.Optional("photo_requete", default=""): _requete_photo,
    # Estimation fournie par le générateur, affichée à titre indicatif
    vol.Optional("calories_portion"): _nombre(0, 5_000, entier=True),
    vol.Optional("jus"): INFOS_JUS,
})

PARAMETRES = _objet({
    vol.Required("jours"): _nombre(1, 7, entier=True),
    vol.Required("repas"): vol.All(_liste(_dans(REPAS), 1, len(REPAS)), lambda l: [r for r in REPAS if r in l]),
    vol.Required("personnes"): _nombre(1, 12, entier=True),
    vol.Optional("preferences", default=list): vol.All(
        _liste(_dans(PREFERENCES), 0, len(PREFERENCES)), lambda l: sorted(set(l))),
    vol.Optional("allergies", default=list): vol.All(
        _liste(_dans(ALLERGIES), 0, len(ALLERGIES)), lambda l: sorted(set(l))),
    vol.Optional("note", default=""): vol.All(vol.Any(str, None), nettoyer_note),
})


PARAMETRES_PLAT = _objet({
    vol.Required("repas"): _dans(REPAS),
    vol.Required("personnes"): _nombre(1, 12, entier=True),
    vol.Optional("preferences", default=list): vol.All(
        _liste(_dans(PREFERENCES), 0, len(PREFERENCES)), lambda l: sorted(set(l))),
    vol.Optional("allergies", default=list): vol.All(
        _liste(_dans(ALLERGIES), 0, len(ALLERGIES)), lambda l: sorted(set(l))),
    vol.Optional("note", default=""): vol.All(vol.Any(str, None), nettoyer_note),
})


def valider_parametres_plat(parametres: object) -> dict:
    if not isinstance(parametres, dict):
        raise vol.Invalid("objet attendu")
    return PARAMETRES_PLAT(parametres)


def valider_parametres(parametres: object) -> dict:
    if not isinstance(parametres, dict):
        raise vol.Invalid("objet attendu")
    return PARAMETRES(parametres)


def valider_recette(recette: object, jus: bool = False) -> dict:
    """`jus` : le sous-objet « jus » (objectif, moment…) est obligatoire."""
    if not isinstance(recette, dict):
        raise vol.Invalid("objet attendu")
    valide = RECETTE(recette)
    if jus and "jus" not in valide:
        raise vol.Invalid("informations du jus manquantes")
    return valide


# ---- CONFORMITÉ : HALAL ET ALLERGIES ----
# Contrôle par mots entiers sur le texte normalisé (nom du plat, ingrédients, étapes).
# En cas de doute, la recette est rejetée : un rejet coûte une nouvelle génération,
# un faux négatif servirait un plat non conforme.

# Toujours refusés
_INTERDITS = (
    "porc", "cochon", "pork", "saindoux", "rillette", "andouille", "andouillette", "boudin noir",
    "vin", "vin blanc", "vin rouge", "biere", "rhum", "cognac", "brandy", "whisky", "whiskey",
    "vodka", "liqueur", "kirsch", "calvados", "porto", "marsala", "mirin", "sake", "cidre",
    "champagne", "wine", "beer", "rum", "alcool",
)
# Refusés sauf si le même élément précise une version halal (bœuf, dinde, volaille, végétale…)
_SAUF_PRECISION = (
    "lard", "lardon", "jambon", "bacon", "saucisson", "chorizo", "salami", "pepperoni",
    "pancetta", "prosciutto", "coppa", "gelatine", "ham", "saucisse", "boudin", "rosette",
    "mortadelle",
)
_PRECISIONS_HALAL = ("halal", "dinde", "boeuf", "volaille", "poulet", "vegetale", "agar", "poisson")
# Expressions retirées avant contrôle : le vinaigre (de vin, de cidre) n'est pas une boisson alcoolisée
_EXCEPTIONS = ("vinaigre de vin", "vinaigre de cidre", "sans alcool", "lait de coco", "creme de coco",
               "noi de coco", "sans gluten", "sans lactose", "lait vegetal", "lait d amande",
               "lait d avoine", "lait de soja")

_MOTS_ALLERGENES = {
    "gluten": ("ble", "farine", "pain", "pate", "semoule", "boulgour", "orge", "seigle", "epeautre",
               "couscou", "chapelure", "biscuit", "brioche", "crouton", "gluten"),
    "lactose": ("lait", "beurre", "creme", "fromage", "yaourt", "mozzarella", "parmesan", "emmental",
                "feta", "ricotta", "mascarpone", "lactose", "chevre"),
    "arachide": ("arachide", "cacahuete"),
    "fruits-a-coque": ("noi", "noisette", "amande", "cajou", "pistache", "pecan", "macadamia"),
    "oeuf": ("oeuf", "mayonnaise", "meringue"),
    "poisson": ("poisson", "saumon", "thon", "cabillaud", "sardine", "maquereau", "colin", "merlu",
                "truite", "anchoi", "dorade", "lieu noir", "nuoc mam"),
    "crustaces": ("crevette", "crabe", "homard", "langoustine", "ecrevisse", "gamba"),
    "soja": ("soja", "tofu", "tempeh", "edamame", "miso"),
    "sesame": ("sesame", "tahini", "tahin"),
}


def _contient(texte: str, mots: tuple[str, ...]) -> bool:
    entoure = f" {texte} "
    return any(f" {normaliser_nom(m)} " in entoure for m in mots)


def _sans_exceptions(texte: str) -> str:
    for exception in _EXCEPTIONS:
        texte = f" {texte} ".replace(f" {normaliser_nom(exception)} ", " ").strip()
    return texte


def motif_rejet(recette: dict, allergies: list[str]) -> str | None:
    """None si la recette est conforme, sinon « halal » ou « allergie »."""
    segments = [recette["nom"], *(i["nom"] for i in recette["ingredients"]), *recette["etapes"]]
    for segment in segments:
        texte = _sans_exceptions(normaliser_nom(segment))
        if _contient(texte, _INTERDITS):
            return "halal"
        if _contient(texte, _SAUF_PRECISION) and not _contient(texte, _PRECISIONS_HALAL):
            return "halal"
    for allergie in allergies:
        mots = _MOTS_ALLERGENES.get(allergie, ())
        if any(_contient(_sans_exceptions(normaliser_nom(s)), mots) for s in segments):
            return "allergie"
    return None


def evaluer_plat(brut: object, allergies: list[str], jus: bool = False) -> tuple[dict | None, str | None]:
    """(recette validée, None) si le plat est utilisable, sinon (None, motif).

    motif : « invalide » (format), « halal » ou « allergie ».
    """
    try:
        recette = valider_recette(brut, jus)
    except vol.Invalid:
        return None, "invalide"
    if motif := motif_rejet(recette, allergies):
        return None, motif
    return recette, None


# ---- LISTE DE COURSES ----

_LIBELLES_UNITES = {
    "g": "g", "kg": "kg", "ml": "ml", "cl": "cl", "l": "l",
    "piece": "pièce(s)", "cas": "c. à s.", "cac": "c. à c.", "pincee": "pincée(s)",
    "botte": "botte(s)", "tranche": "tranche(s)", "boite": "boîte(s)", "autre": "",
}
FORMAT_DESCRIPTION = re.compile(
    r"qte=(\d{1,5}(?:\.\d{1,3})?);unite=(" + "|".join(UNITES) + r");rayon=("
    + "|".join(re.escape(r) for r in RAYONS) + r");source=(menu|manuel)"
)


def texte_quantite(quantite: float) -> str:
    """500.0 → « 500 » ; 1.25 → « 1.25 » (3 décimales au plus)."""
    return f"{round(quantite, 3):.3f}".rstrip("0").rstrip(".")


def description_article(quantite: float, unite: str, rayon: str, source: str = "menu") -> str:
    return f"qte={texte_quantite(quantite)};unite={unite};rayon={rayon};source={source}"


def lire_description(description: object) -> dict | None:
    """Format commun des articles de Courses ; None si la description n'est pas conforme."""
    if not isinstance(description, str) or not (m := FORMAT_DESCRIPTION.fullmatch(description.strip())):
        return None
    return {"quantite": float(m[1]), "unite": m[2], "rayon": m[3], "source": m[4]}


def titre_article(nom: str, quantite: float, unite: str) -> str:
    """« Tomates — 500 g » (quantité omise si nulle)."""
    if quantite <= 0:
        return nom
    libelle = _LIBELLES_UNITES[unite]
    return f"{nom} — {texte_quantite(quantite)}{' ' + libelle if libelle else ''}"


def nom_article(titre: str) -> str:
    """Partie nom d'un titre « Tomates — 500 g »."""
    return titre.split(" — ", 1)[0].strip()


def lignes_courses(recettes: list[dict]) -> tuple[list[dict], int]:
    """Ingrédients fusionnés par (nom normalisé, unité). Renvoie (lignes, ignorés)."""
    lignes: dict[tuple[str, str], dict] = {}
    ignores = 0
    for recette in recettes:
        for ingredient in recette["ingredients"]:
            cle = normaliser_nom(ingredient["nom"])
            if not cle:
                ignores += 1
                continue
            ligne = lignes.setdefault((cle, ingredient["unite"]), {
                "cle": cle,
                "nom": ingredient["nom"][:1].upper() + ingredient["nom"][1:],
                "quantite": 0.0,
                "unite": ingredient["unite"],
                "rayon": ingredient["rayon"],
            })
            ligne["quantite"] = round(ligne["quantite"] + ingredient["quantite"], 3)
    return list(lignes.values()), ignores


# ---- RÉGLAGES ----


def url_generateur_valide(url: object) -> bool:
    """Adresse du worker : HTTPS obligatoire, hôte présent, sans identifiants dans l'URL."""
    if not isinstance(url, str):
        return False
    try:
        decoupe = urlsplit(url.strip())
        return decoupe.scheme == "https" and bool(decoupe.hostname) and not decoupe.username and not decoupe.password
    except ValueError:
        return False


# ---- MÉTÉO : CONSEIL DE JUS DU JOUR ----
# Calculé à partir de l'entité météo de HA : aucun appel externe.

_LIBELLES_CONDITIONS = {
    "sunny": "ciel dégagé", "clear-night": "nuit claire", "partlycloudy": "éclaircies",
    "cloudy": "ciel couvert", "fog": "brouillard", "rainy": "pluie", "pouring": "forte pluie",
    "lightning": "orage", "lightning-rainy": "orage", "snowy": "neige", "snowy-rainy": "pluie et neige",
    "hail": "grêle", "windy": "vent", "windy-variant": "vent", "exceptional": "temps exceptionnel",
}
_LIBELLES_OBJECTIFS = {
    "fraicheur": "la fraîcheur", "vitalite": "la vitalité", "immunite": "l'immunité",
    "antioxydant": "les antioxydants", "digestif": "la digestion",
}


def conseil_meteo(condition: object, temperature: object) -> dict:
    """{objectif, texte, condition, temperature} ; règles fixes, sans IA."""
    condition = condition if isinstance(condition, str) else ""
    try:
        temperature = round(float(temperature))
    except (TypeError, ValueError):
        temperature = None
    if (temperature is not None and temperature >= 25) or condition == "sunny":
        objectif = "fraicheur"
    elif (temperature is not None and temperature <= 8) or condition in (
            "rainy", "pouring", "snowy", "snowy-rainy", "hail", "lightning", "lightning-rainy"):
        objectif = "immunite"
    elif condition in ("cloudy", "fog", "partlycloudy", "windy", "windy-variant"):
        objectif = "vitalite"
    else:
        objectif = "antioxydant"
    morceaux = [f"{temperature} °C" if temperature is not None else "", _LIBELLES_CONDITIONS.get(condition, "")]
    constat = ", ".join(m for m in morceaux if m)
    texte = f"{constat[:1].upper() + constat[1:]} → privilégiez {_LIBELLES_OBJECTIFS[objectif]}" if constat \
        else f"Privilégiez {_LIBELLES_OBJECTIFS[objectif]}"
    return {"objectif": objectif, "texte": texte, "condition": condition or None, "temperature": temperature}


# ---- PHOTOS : CONTRÔLES AVANT TÉLÉCHARGEMENT ET AFFICHAGE ----

FORMAT_ID_PHOTO = re.compile(r"[0-9a-f]{16}")


def _url_https(url: object, hotes: tuple[str, ...]) -> bool:
    if not isinstance(url, str) or len(url) > 500:
        return False
    try:
        decoupe = urlsplit(url)
        return (decoupe.scheme == "https" and decoupe.hostname in hotes and decoupe.port in (None, 443)
                and not decoupe.username and not decoupe.password)
    except ValueError:
        return False


def url_image_autorisee(url: object) -> bool:
    """Seule origine de téléchargement acceptée : https://images.pexels.com/…"""
    return _url_https(url, (HOTE_IMAGES,))


def credit_photo(auteur: object, lien: object) -> dict | None:
    """Crédit affichable (texte seulement) ; lien conservé uniquement vers pexels.com."""
    auteur = re.sub(r"[\x00-\x1f\x7f]", " ", auteur).strip()[:80] if isinstance(auteur, str) else ""
    return {"auteur": auteur or "Pexels", "lien": lien if _url_https(lien, HOTES_CREDIT) else None}


def type_image(debut: bytes) -> str | None:
    """Type réel d'après la signature binaire (le Content-Type annoncé ne suffit pas)."""
    if debut.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if debut.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if debut[:4] == b"RIFF" and debut[8:12] == b"WEBP":
        return "webp"
    return None
