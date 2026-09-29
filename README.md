# My Home Assistant

Dashboard custom (HTML / CSS / JS vanilla) pour Home Assistant, chargé comme panneau `panel_custom`.

## Structure

```
smarthome/
├── smarthome-panel.js   Point d'entrée du panneau (web component)
├── shell.html           Cadre : sidebar + header
├── views/               Une vue par page (tableau de bord, …)
├── js/                  Modules partagés (accès HA, DOM, météo, prières, horloge)
├── css/                 Styles (variables, sidebar, cards)
└── dev/                 Aperçu hors Home Assistant avec un faux `hass`

custom_components/maison/  Intégration HA : budget stocké côté serveur, protégé par un code
tests/maison/              Tests de l'intégration (python -m unittest discover -s tests/maison)
```

## Configuration

Copier `smarthome/js/config.example.js` en `smarthome/js/config.js`, puis adapter les entités.
`config.js` est ignoré par git.

Aucun token : le panneau reçoit l'objet `hass` de Home Assistant, avec la session de l'utilisateur connecté.

## Développement

```
python smarthome/dev/serveur.py
```

Puis ouvrir `http://localhost:8765/dev/`. Les états sont simulés par `dev/mock-hass.js`.
Ce serveur désactive le cache : un simple rechargement prend toujours la dernière version des modules JS.

Depuis la console du navigateur :
- `mock.basculer('binary_sensor.lave_linge')` : déclenche une alerte ;
- `mock.definir('sensor.tablette_battery_level', '15')` : simule un niveau de batterie.

Vue Budget en dev : code de démonstration `123456` (le vrai code est défini dans Home Assistant).

## Déploiement

1. Copier `smarthome/` dans `/config/www/smarthome/` sur Home Assistant, **sans le dossier `dev/`**.
2. Ajouter dans `configuration.yaml` :

   ```yaml
   panel_custom:
     - name: smarthome-panel
       url_path: maison
       sidebar_title: Maison
       sidebar_icon: mdi:home
       module_url: /local/smarthome/smarthome-panel.js?v=1
   ```

3. Copier `custom_components/maison/` dans `/config/custom_components/maison/`.
4. Redémarrer Home Assistant. Le panneau apparaît dans le menu sous « Maison ».
5. Budget : Paramètres → Appareils et services → Ajouter une intégration → **Maison**,
   puis choisir le code à 6 chiffres (compte administrateur requis).
   Pour changer le code : Maison → Configurer.

Incrémenter `?v=` à chaque mise à jour pour forcer le navigateur à recharger les fichiers.

## Énergie & Fluides

La vue lit les **statistiques longue durée** de Home Assistant : chaque capteur doit avoir
`state_class: total_increasing` (index de compteur). Les entités sont déclarées dans
`config.js` (section `ENERGIE`) ; une carte sans capteur affiche « non configuré ».

**Eau, saisie manuelle de l'index** (en attendant un capteur automatique) — dans `configuration.yaml` :

```yaml
input_number:
  index_eau:
    name: Index eau
    min: 0
    max: 999999
    step: 0.001
    mode: box
    unit_of_measurement: m³

template:
  - sensor:
      - name: Index eau
        unique_id: index_eau
        unit_of_measurement: m³
        device_class: water
        state_class: total_increasing
        state: "{{ states('input_number.index_eau') | float(0) }}"
```

Le bouton « Saisir nouvel index » modifie `input_number.index_eau` ; le capteur `sensor.index_eau`
alimente les statistiques. Un futur capteur automatique remplacera simplement `sensor.index_eau`.

## Calendrier familial

Une **catégorie** (Famille, Rendez-vous, Anniversaires…) = un calendrier HA, avec sa couleur.
Dans Home Assistant : Paramètres → Appareils et services → Ajouter une intégration →
**Calendrier local**, une fois par catégorie ; puis **Liste de tâches locale** pour les tâches.
Déclarer les entités dans `config.js`, section `CALENDRIER`.

- « + Ajouter un événement » : date fixe, ou répétition chaque semaine, mois ou année
  (anniversaires : « Chaque année », journée entière). La règle de répétition est construite
  uniquement à partir des choix du formulaire.
- `discret: true` sur une catégorie : ses événements s'affichent « Occupé », sans titre.
  « Rendez-vous » est discret par défaut (à reporter dans le vrai `config.js`).
- Membres : seulement l'entité `person.*` dans `config.js` (fichier public) ; le nom affiché vient de HA.
- La tablette (compte non-admin) peut lire et créer des événements, et cocher des tâches.
- La carte « Calendrier famille — aujourd'hui » de l'accueil utilise les mêmes catégories.

## Vie

Maison (scénarios, pièces, caméras, appareils) et bien-être & spiritualité, avec quatre
sous-pages : détail d'une pièce, Bien-être (matin, après-midi, soir), Découvrir et Rituel du soir.
Entités et images dans `config.js`, section `VIE` ; une entité absente est simplement ignorée.

- **Images** : fonds et illustration du salon libres de droits, fournis dans `smarthome/assets/images/`
  (auteurs et licences : [CREDITS.md](smarthome/assets/images/CREDITS.md)). Pour en changer, les déposer
  dans `/config/www/images/` et les déclarer dans `VIE.fonds`. Ce dossier est public (`/local/`) :
  **jamais de photo de l'intérieur de la maison**.
- **Actions rapides** : automatisations HA (`automation.*`) déclenchées depuis la tablette. Le déclenchement
  manuel ignore leurs conditions.
- **Caméras** : l'image vient de Home Assistant (`entity_picture`), avec la session de l'utilisateur.
- **Lumière douce** (rituel du soir) : `sceneLumiereDouce` désigne une scène HA à créer.

Sources externes, appelées depuis la tablette, sans clé :

| Contenu | Source | Limite |
|---|---|---|
| Versets (arabe + traduction française) | [UmmahAPI](https://ummahapi.com) | 5000 requêtes / 15 min |
| Audio des versets | everyayah.com (URL fournie par UmmahAPI, hôte vérifié) | — |
| Citation du jour | [citation.lecog.fr](https://citation.lecog.fr) | 100 requêtes / h, mise en cache pour la journée |
| Horaires de prière | [Aladhan](https://aladhan.com/prayer-times-api) | mis en cache pour la journée |

Les invocations (arabe, translittération, traduction, source) sont dans
`views/vie/contenus.js`. Le calendrier hégirien est calculé par le navigateur
(Umm al-Qura) ; les dates peuvent différer d'un jour de l'observation locale.

## Menu

Menus de la semaine générés par un worker externe (IA), appelé **uniquement par l'intégration `maison`** :
la tablette ne contacte jamais le générateur. Quota de générations par jour, filtre halal et allergies
côté serveur, recettes validées avant d'être enregistrées.

- Réglages (compte administrateur) : Maison → Configurer → **Générateur de menu** : URL https du worker,
  secret (jamais réaffiché), repas proposés, quota par jour, liste de courses (`todo.*`).
- « Ajouter aux courses » : les ingrédients sont écrits par le serveur dans la liste de courses,
  avec les doublons additionnés. Format des articles : `qte=…;unite=…;rayon=…;source=menu|manuel`.
- Les recettes sont générées automatiquement : la vue affiche toujours « à vérifier (cuisson, allergènes) ».
- Page Menu : le plat du jour en avant, la semaine (un plat principal par jour, les autres repas dessous),
  les courses, puis les jus en bas de page. Repas proposés (petit-déjeuner, déjeuner, dîner, jus) :
  Maison → Configurer → Générateur de menu.
- **Un plat simple** : génère un seul plat sans toucher au menu de la semaine (compte dans le quota) ;
  les 5 derniers restent disponibles et peuvent être ajoutés aux courses.
- Calories : estimation par portion, affichée seulement si le générateur la fournit.
- **Jus du jour** : 6 jus préparés au premier affichage de la journée (hors quota), avec un conseil selon
  la météo. Choisir l'entité `weather.*` dans les options du générateur de menu (facultatif).
- **Photos** (plats et jus) : trouvées par le worker sur Pexels, téléchargées et réencodées par l'intégration
  (stockées dans `/config/maison/photos`, jamais dans `/config/www`), servies par une adresse signée.
  Il faut la clé `PEXELS_API_KEY` dans les secrets du worker ; sans elle, un dégradé remplace la photo.

## Liste de courses

Liste partagée : une entité `todo.*` (intégration **Liste de tâches locale**), déclarée dans `config.js`
(section `COURSES`). C'est la même que celle choisie dans les options du générateur de menu, et elle
apparaît aussi dans l'application HA du téléphone, pratique au magasin.

- Articles au format commun avec le Menu (`qte=…;unite=…;rayon=…;source=menu|manuel`) : un article saisi
  à la main et le même ingrédient envoyé par le Menu s'additionnent. Un article ajouté depuis
  l'application HA, sans ce format, s'affiche tel quel dans « Autre ».
- « Retirer du panier » et « Ajouter les ingrédients » du menu demandent un second appui.
- **Imprimer / PDF** : imprime les articles à acheter par rayon ; la fenêtre d'impression de la tablette
  propose « Enregistrer en PDF » (en mode kiosque, l'impression doit y être autorisée).
- **Terminer les courses** : magasin, date, total (facultatif) et prix des articles cochés, pré-remplis par
  le dernier prix connu dans ce magasin. Magasins à saisir dans Maison → Configurer → Magasins.
- **Comparateur** : le magasin le moins cher sur votre panier habituel (articles achetés au moins 2 fois
  en 90 jours), comparé au prix au kilo, au litre ou à la pièce. **Dernières courses** : sans montant ;
  les totaux ne se lisent qu'avec le code du Budget.

## Réglages

Page Réglages de la tablette (compte non administrateur) :

- **Foyer** : nom et membres (prénom, couleur, parent ou enfant, personne HA liée). Modifier demande le
  code du Budget ; la session se referme en quittant la page ou après 10 minutes sans action.
  Le rôle n'est qu'une étiquette : il ne donne aucun droit dans Home Assistant.
- **Affichage** et **Notifications** : sans code, enregistrés par l'intégration `maison`.
- **Appareils** : lus dans Home Assistant (en ligne / hors ligne). **Abonnements** : capteurs déclarés
  dans `config.js`, section `CONFIGURATIONS` (date de renouvellement ou montant).
- Mot de passe, double authentification, appairage Zigbee, générateur de menu et code du Budget :
  uniquement depuis Home Assistant sur un ordinateur.

## Sécurité

- Tout ce qui est dans `/config/www` est servi en `/local/` **sans authentification** :
  ni token, ni donnée personnelle (budget, calendrier, courses) dans ces fichiers.
  Les données personnelles passent par Home Assistant.
- Budget : données stockées par l'intégration `maison` (hors `hass.states`), lisibles uniquement
  après saisie du code, vérifié côté serveur. Blocage progressif après 5 essais erronés.
- Les tests de `tests/security/` tournent sur chaque PR : secrets, webhooks en dur, `eval`, `innerHTML`.
- Construire le DOM avec `el()` (`js/dom.js`) : pas de `innerHTML`, pas d'attribut `on*`.

## Contribution

- Une branche par fonctionnalité, fusion via Pull Request.
- Pas de framework ni de dépendance : HTML / CSS / JS vanilla.
- Aucun secret ni donnée personnelle dans le repo.
