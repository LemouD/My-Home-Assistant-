// =============================================
// CONFIG — Smarthome Dashboard
// =============================================
// Copier ce fichier en config.js puis adapter les entités.
// config.js est ignoré par git.
//
// Aucun token ici : l'authentification est fournie par Home Assistant.
// Les noms affichés viennent de Home Assistant (friendly_name) ;
// `nom` ne sert que tant que l'entité n'existe pas encore.

export default {
  // Ville affichée sur la météo et les prières (facultatif)
  VILLE: 'Paris, FR',

  // Méthode de calcul des horaires (12 = Union des Organisations Islamiques de France)
  METHODE_PRIERE: 12,

  // Rafraîchissement météo (millisecondes)
  REFRESH_METEO: 900000,

  // icone : ampoule, cuisine, lit, bain, bureau, porte (assets/icons/accueil/piece-*.svg)
  // teinte quand la lumière est allumée : ambre (défaut), bleu, vert, orange
  LUMIERES: [
    { id: 'light.salon',         nom: 'Salon',         icone: 'ampoule', teinte: 'ambre' },
    { id: 'light.cuisine',       nom: 'Cuisine',       icone: 'cuisine', teinte: 'ambre' },
    { id: 'light.chambre',       nom: 'Chambre',       icone: 'lit',     teinte: 'ambre' },
    { id: 'light.salle_de_bain', nom: 'Salle de bain', icone: 'bain',    teinte: 'bleu' },
    { id: 'light.bureau',        nom: 'Bureau',        icone: 'bureau',  teinte: 'vert' },
    { id: 'light.entree',        nom: 'Entrée',        icone: 'porte',   teinte: 'orange' },
  ],

  PRESENCES: [
    { id: 'person.membre_1', nom: 'Membre 1' },
    { id: 'person.membre_2', nom: 'Membre 2' },
  ],

  // Batterie de la tablette murale, publiée par l'application Home Assistant (Companion)
  // installée sur la tablette. Remplacer "tablette" par le nom de l'appareil dans HA.
  BATTERIE_TABLETTE: {
    niveau: 'sensor.tablette_battery_level',  // pourcentage
    charge: 'sensor.tablette_battery_state',  // charging / discharging / full / not_charging
  },

  // Énergie & Fluides. Chaque capteur est facultatif : sans capteur, la carte
  // correspondante affiche « non configuré ». Capteurs d'énergie ou d'index
  // avec state_class: total_increasing (statistiques longue durée de HA).
  ENERGIE: {
    electricite: {
      hc: 'sensor.linky_index_hc',          // kWh, heures creuses
      hp: 'sensor.linky_index_hp',          // kWh, heures pleines
      tarifHC: 0.17,                        // € / kWh
      tarifHP: 0.27,
    },
    eau: {
      index: 'sensor.index_eau',            // m³ (voir README : saisie manuelle de l'index)
      saisie: 'input_number.index_eau',     // champ modifié par « Saisir nouvel index »
      prixM3: 4.3,                          // € / m³, assainissement compris
    },
    // Appareils suivis par une prise connectée (capteur d'énergie en kWh)
    postes: [
      // { nom: 'Lave-linge', capteur: 'sensor.prise_lave_linge_energie', couleur: 'ambre' },
    ],
    // Sondes de température intérieure et consigne recommandée
    temperatures: [],
    consigne: 19,
  },

  // Vie : scénarios, pièces, caméras, appareils. Entités Home Assistant.
  VIE: {
    // Actions rapides = automatisations HA (automation.*), déclenchées par « Activer / Lancer ».
    // Attention : le déclenchement manuel ignore les conditions de l'automatisation.
    // Autres types acceptés : scene, script, vacuum, button.
    scenarios: [
      { nom: 'Mode Cinéma', description: 'Ambiance du salon',   icone: 'cinema',      entite: 'automation.mode_cinema', action: 'Activer' },
      { nom: 'Nettoyage',   description: 'Aspirateur du foyer', icone: 'etincelles',  entite: 'automation.nettoyage', action: 'Lancer' },
      { nom: 'Mode Nuit',   description: 'Maison au calme',     icone: 'lune-etoile', entite: 'automation.mode_nuit', action: 'Activer' },
    ],
    // icone des lumières : plafonnier, lampe, lampe-tv, bandeau
    pieces: [
      {
        id: 'salon', nom: 'Salon', sousTitre: 'Lumières et ambiance',
        // Illustration facultative, libre de droits. /config/www/images/ est public (/local/,
        // sans authentification) : jamais de vraie photo de l'intérieur de la maison.
        image: '/local/smarthome/assets/images/vie/salon.webp',
        lumieres: [
          { id: 'light.salon_plafonnier', nom: 'Plafonnier',   icone: 'plafonnier' },
          { id: 'light.salon_canape',     nom: 'Lampe canapé', icone: 'lampe' },
          { id: 'light.salon_tv',         nom: 'Lampe TV',     icone: 'lampe-tv' },
          { id: 'light.salon_led',        nom: 'Bandeau LED',  icone: 'bandeau' },
        ],
      },
      {
        id: 'cuisine', nom: 'Cuisine', sousTitre: 'Lumières',
        lumieres: [
          { id: 'light.cuisine_plafonnier', nom: 'Plafonnier', icone: 'plafonnier' },
          { id: 'light.cuisine_ilot',       nom: 'Îlot',       icone: 'lampe' },
          { id: 'light.cuisine_plan',       nom: 'Plan de travail', icone: 'bandeau' },
        ],
      },
      {
        id: 'chambre', nom: 'Chambre', sousTitre: 'Lumières',
        lumieres: [
          { id: 'light.chambre_plafonnier', nom: 'Plafonnier',  icone: 'plafonnier' },
          { id: 'light.chambre_chevet',     nom: 'Lampe chevet', icone: 'lampe' },
        ],
      },
    ],
    cameras: [
      { id: 'camera.salon',  nom: 'Salon' },
      { id: 'camera.entree', nom: 'Entrée' },
    ],
    appareils: {
      aspirateur: 'vacuum.aspirateur',
      tv: 'media_player.tv',
      thermostat: 'climate.salon',
      prises: ['switch.prise_salon', 'switch.prise_bureau', 'switch.prise_cuisine', 'switch.prise_chambre'],
    },
    // Fonds de « Bien-être » et « Découvrir » : images libres fournies avec le panneau
    // (assets/images/vie/, crédits dans assets/images/CREDITS.md). Pour en changer, décommenter :
    // fonds: { matin: '/local/images/mon-fond.webp', apresMidi: '…', soir: '…', decouvrirSpiritualite: '…', decouvrirMotif: '…' },
    // Récitateur des versets (UmmahAPI) : 1 = Mishary Alafasy, 2 = Al-Sudais, 3 = Abdul Basit
    recitateur: 1,
    // Scène déclenchée à l'étape « Lumière douce » du rituel du soir (facultatif)
    sceneLumiereDouce: 'scene.lumiere_douce',
  },

  // Une alerte s'affiche quand l'entité est à "on".
  // gravite : info (bleu, défaut), attention (ambre), danger (rouge)
  ALERTES: [
    { id: 'binary_sensor.lave_linge', libelle: 'Lave-linge terminé', gravite: 'info' },
  ],

  // Calendrier familial. Une catégorie = un calendrier « Calendrier local » créé dans HA
  // (Paramètres → Appareils et services → Ajouter une intégration → Calendrier local).
  // couleur : bleu, vert, rouge, ambre ou cyan. discret: true → affiché « Occupé », sans titre.
  CALENDRIER: {
    calendriers: [
      { id: 'calendar.famille',      nom: 'Famille',       couleur: 'bleu' },
      { id: 'calendar.rendez_vous',  nom: 'Rendez-vous',   couleur: 'vert', discret: true },
      { id: 'calendar.anniversaires', nom: 'Anniversaires', couleur: 'ambre' },
      { id: 'calendar.ecole',        nom: 'École',         couleur: 'cyan' },
      { id: 'calendar.activites',    nom: 'Activités',     couleur: 'rouge' },
    ],
    // Liste de tâches (intégration « Liste de tâches locale »)
    taches: 'todo.maison',
    // Interrupteurs « Membres » : masquent les catégories liées au membre.
    // Pas de prénoms ici (fichier public) : le nom affiché est celui de l'entité person.* dans HA.
    membres: [
      { personne: 'person.membre_1', couleur: 'bleu', calendriers: [] },
      { personne: 'person.membre_2', couleur: 'ambre', calendriers: [] },
      { personne: 'person.enfant_1', couleur: 'vert', calendriers: ['calendar.ecole'] },
      { personne: 'person.enfant_2', couleur: 'cyan', calendriers: ['calendar.activites'] },
    ],
  },

  // Liste de courses : entité todo.* (intégration « Liste de tâches locale »), la même que celle
  // choisie dans les options du générateur de menu (Maison → Configurer → Générateur de menu).
  COURSES: {
    liste: 'todo.courses',
  },

  // Réglages : abonnements affichés en lecture seule (capteurs HA : date de renouvellement ou montant).
  // Appareils : lus directement dans Home Assistant, rien à déclarer.
  CONFIGURATIONS: {
    abonnements: [],
  },
};
