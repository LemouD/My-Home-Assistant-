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
  // Méthode de calcul des horaires (12 = Union des Organisations Islamiques de France)
  METHODE_PRIERE: 12,

  // Rafraîchissement météo (millisecondes)
  REFRESH_METEO: 900000,

  LUMIERES: [
    { id: 'light.salon',         nom: 'Salon',         icone: '🛋️' },
    { id: 'light.cuisine',       nom: 'Cuisine',       icone: '🍳' },
    { id: 'light.chambre',       nom: 'Chambre',       icone: '🛏️' },
    { id: 'light.bureau',        nom: 'Bureau',        icone: '💻' },
    { id: 'light.entree',        nom: 'Entrée',        icone: '🚪' },
    { id: 'light.salle_de_bain', nom: 'Salle de bain', icone: '🚿' },
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

  // Une alerte s'affiche quand l'entité est à "on".
  ALERTES: [
    { id: 'binary_sensor.lave_linge',   libelle: 'Lave-linge terminé',   icone: '🫧' },
  ],
};
