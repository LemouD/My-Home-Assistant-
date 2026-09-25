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
