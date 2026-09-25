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
