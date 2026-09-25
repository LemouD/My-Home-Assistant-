# My Home Assistant

Dashboard custom (HTML / CSS / JS vanilla) pour Home Assistant.

## Structure

```
smarthome/
├── index.html      Tableau de bord
├── css/            Styles (variables, sidebar, cards)
├── js/             Logique (API HA, météo, prières, horloge)
└── assets/         Icônes
```

## Installation locale

1. Copier `smarthome/js/config.example.js` en `smarthome/js/config.js`.
2. Renseigner l'URL Home Assistant, le token et les entités dans `config.js`.
3. Ouvrir `smarthome/index.html` via un serveur local (ex. `npx serve smarthome`).

`config.js` est ignoré par git : il ne doit jamais être commité.

## Déploiement

Copier le dossier `smarthome/` dans `/config/www/smarthome/` sur Home Assistant,
puis l'ajouter comme panneau (`/local/smarthome/index.html`).

## Contribution

- Une branche par fonctionnalité, fusion via Pull Request.
- Pas de framework ni de dépendance : HTML / CSS / JS vanilla.
- Aucun secret ni donnée personnelle dans le repo.
