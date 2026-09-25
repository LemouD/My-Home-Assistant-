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

  // Une alerte s'affiche quand l'entité est à "on".
  // gravite : info (bleu, défaut), attention (ambre), danger (rouge)
  ALERTES: [
    { id: 'binary_sensor.lave_linge', libelle: 'Lave-linge terminé', gravite: 'info' },
  ],
};
