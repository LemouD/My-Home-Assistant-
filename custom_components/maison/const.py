"""Constantes de l'intégration Maison."""

DOMAIN = "maison"

# Stockage dans .storage/ (inclus dans les sauvegardes HA), fichiers en lecture seule pour HA
STOCKAGE_CLE = "maison.budget"
STOCKAGE_VERSION = 1
STOCKAGE_VERROU_CLE = "maison.verrou"
STOCKAGE_VERROU_VERSION = 1

# Code d'accès : 6 chiffres, conservé uniquement sous forme d'empreinte PBKDF2
ITERATIONS_PBKDF2 = 200_000

# Anti force brute : après ESSAIS_MAX échecs, blocage qui double à chaque récidive.
# Au plafond : 5 essais par heure, soit plus de 10 ans en moyenne pour trouver un code.
ESSAIS_MAX = 5
BLOCAGE_INITIAL = 60      # secondes
BLOCAGE_MAX = 3600        # secondes

# Session ouverte par le code : prolongée à chaque requête, fermée après inactivité,
# et dans tous les cas après DUREE_SESSION_MAX
DUREE_SESSION = 600       # secondes
DUREE_SESSION_MAX = 3600  # secondes
SESSIONS_MAX = 20

# Catégorie du budget résumée pour la vue Courses (maison/budget/resume)
CATEGORIE_COURSES = "Alimentation"

# ---- MENU (génération par le worker « mode ha ») ----

STOCKAGE_MENU_CLE = "maison.menu"
STOCKAGE_MENU_VERSION = 1

# Listes fermées partagées avec le panneau : toute valeur hors liste est refusée
REPAS = ("petit_dej", "jus", "dejeuner", "diner")
UNITES = ("g", "kg", "ml", "cl", "l", "piece", "cas", "cac", "pincee", "botte", "tranche", "boite", "autre")
RAYONS = (
    "fruits-legumes", "boucherie", "poissonnerie", "cremerie", "boulangerie",
    "epicerie", "surgeles", "boissons", "entretien", "hygiene", "autre",
)
PREFERENCES = ("rapide", "economique", "vegetarien", "poisson", "leger", "enfants")
ALLERGIES = ("gluten", "lactose", "arachide", "fruits-a-coque", "oeuf", "poisson", "crustaces", "soja", "sesame")

# Réglages par défaut (options de l'intégration)
REPAS_DEFAUT = ("jus", "diner")
QUOTA_MENU_DEFAUT = 10        # générations (ou remplacements) par jour
NOTE_MAX = 200                # texte libre envoyé au générateur
EXPIRATION_GENERATION = 300   # secondes : au-delà, une génération bloquée est oubliée
DELAI_WORKER = 240            # secondes : le worker réessaie lui-même jusqu'à 3 fois
CLE_CUISINE = f"{DOMAIN}_cuisine"   # hass.data : état du menu
