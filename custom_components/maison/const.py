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

# ---- JUS ET PHOTOS ----

OBJECTIFS_JUS = ("fraicheur", "vitalite", "immunite", "antioxydant", "digestif")
MOMENTS_JUS = ("matin", "midi", "apres-effort", "gouter", "soiree")
TAILLE_CATALOGUE_JUS = 6
PERSONNES_CATALOGUE_DEFAUT = 2   # sans menu existant pour reprendre ses paramètres

# Photos : téléchargées depuis la seule origine autorisée, réencodées, servies par HA
HOTE_IMAGES = "images.pexels.com"
HOTES_CREDIT = ("pexels.com", "www.pexels.com")
PHOTO_TELECHARGEMENT_MAX = 3_000_000   # octets
PHOTO_PIXELS_MAX = 40_000_000          # contre les « bombes » de décompression
PHOTO_COTE_MAX = 800                   # pixels
PHOTO_POIDS_CIBLE = 200_000            # octets
PHOTOS_DISQUE_MAX = 30_000_000         # octets, tout le dossier
SIGNATURE_PHOTO_HEURES = 24

# ---- DERNIÈRES COURSES ET COMPARATEUR ----

STOCKAGE_COURSES_CLE = "maison.courses"
STOCKAGE_COURSES_VERSION = 1
CLE_CARNET = f"{DOMAIN}_carnet"   # hass.data : carnet des dernières courses
