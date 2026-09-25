// =============================================
// CONFIG — Smarthome Dashboard
// =============================================
// Copier ce fichier en config.js puis renseigner les valeurs.
// config.js est ignoré par git : ne jamais y committer de token.

const CONFIG = {
  HA_URL: 'http://homeassistant.local:8123',
  HA_TOKEN: 'VOTRE_TOKEN_ICI',

  // Famille
  FAMILLE: 'Ma famille',
  MEMBRES: ['Membre 1', 'Membre 2'],

  // Localisation (pour météo + prières)
  VILLE: 'Paris',
  LATITUDE: 48.8566,
  LONGITUDE: 2.3522,
  PAYS: 'FR',
  METHODE_PRIERE: 12, // 12 = Union des Organisations Islamiques de France

  // Rafraîchissement (millisecondes)
  REFRESH_STATES: 30000,   // états HA toutes les 30s
  REFRESH_METEO: 900000,   // météo toutes les 15min
  REFRESH_PRIERE: 3600000, // prières toutes les heures

  // Entités Home Assistant (à adapter selon vos vrais appareils)
  LUMIERES: [
    { id: 'light.salon',    nom: 'Salon',    icone: '🛋️' },
    { id: 'light.cuisine',  nom: 'Cuisine',  icone: '🍳' },
    { id: 'light.chambre',  nom: 'Chambre',  icone: '🛏️' },
    { id: 'light.bureau',   nom: 'Bureau',   icone: '💻' },
    { id: 'light.entree',   nom: 'Entrée',   icone: '🚪' },
    { id: 'light.salle_de_bain', nom: 'Salle de bain', icone: '🚿' },
  ],

  PRESENCES: [
    { id: 'person.membre_1', nom: 'Membre 1' },
    { id: 'person.membre_2', nom: 'Membre 2' },
  ],

  ALERTES: [
    { id: 'binary_sensor.porte_garage', nom: 'Porte garage', icone: '🚗', type: 'door' },
    { id: 'binary_sensor.lave_linge',   nom: 'Lave-linge',   icone: '🫧', type: 'machine' },
  ],
};
