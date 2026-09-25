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
```

## Configuration

Copier `smarthome/js/config.example.js` en `smarthome/js/config.js`, puis adapter les entités.
`config.js` est ignoré par git.

Aucun token : le panneau reçoit l'objet `hass` de Home Assistant, avec la session de l'utilisateur connecté.

## Développement

```
npx serve smarthome
```

Puis ouvrir `http://localhost:3000/dev/`. Les états sont simulés par `dev/mock-hass.js`.

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

3. Redémarrer Home Assistant. Le panneau apparaît dans le menu sous « Maison ».

Incrémenter `?v=` à chaque mise à jour pour forcer le navigateur à recharger les fichiers.

## Sécurité

- Tout ce qui est dans `/config/www` est servi en `/local/` **sans authentification** :
  ni token, ni donnée personnelle (budget, calendrier, courses) dans ces fichiers.
  Les données personnelles passent par des entités Home Assistant.
- Les tests de `tests/security/` tournent sur chaque PR : secrets, webhooks en dur, `eval`, `innerHTML`.
- Construire le DOM avec `el()` (`js/dom.js`) : pas de `innerHTML`, pas d'attribut `on*`.

## Contribution

- Une branche par fonctionnalité, fusion via Pull Request.
- Pas de framework ni de dépendance : HTML / CSS / JS vanilla.
- Aucun secret ni donnée personnelle dans le repo.
