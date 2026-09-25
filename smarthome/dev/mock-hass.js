// =============================================
// MOCK-HASS.JS — Faux objet hass pour développer sans Home Assistant
// =============================================
// Reproduit le contrat utilisé par le panneau : states, config, connected, callService.
// Chaque changement d'état crée un nouvel objet hass, comme le fait Home Assistant.

import '../smarthome-panel.js';
import config from '../js/config.js';

const LATENCE_MS = 300;

const states = {};

const definir = (id, state, friendlyName) => {
  states[id] = { entity_id: id, state, attributes: { friendly_name: friendlyName } };
};

config.LUMIERES.forEach((l, i) => definir(l.id, i % 2 === 0 ? 'on' : 'off', l.nom));
config.PRESENCES.forEach((p, i) => definir(p.id, i === 0 ? 'home' : 'not_home', p.nom));
config.ALERTES.forEach((a, i) => definir(a.id, i === 0 ? 'on' : 'off', a.libelle));

const { niveau: batterieNiveau, charge: batterieCharge } = config.BATTERIE_TABLETTE ?? {};
if (batterieNiveau) definir(batterieNiveau, '78', 'Tablette Niveau de batterie');
if (batterieCharge) definir(batterieCharge, 'charging', 'Tablette État de la batterie');

const panneau = document.querySelector('smarthome-panel');

async function callService(domaine, service, { entity_id: cibles }) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  for (const id of [].concat(cibles)) {
    const actuel = states[id];
    if (!actuel) throw new Error(`Entité inconnue : ${id}`);
    const suivant = service === 'toggle' ? (actuel.state === 'on' ? 'off' : 'on')
      : service === 'turn_on' ? 'on' : 'off';
    states[id] = { ...actuel, state: suivant };
  }
  publier();
}

function publier() {
  panneau.hass = {
    states: { ...states },
    connected: true,
    config: {
      location_name: 'Maison démo',
      latitude: 48.8566,
      longitude: 2.3522,
      time_zone: 'Europe/Paris',
    },
    callService,
  };
}

// Navigation par hash en développement : /dev/#/budget
panneau.route = { prefix: `${location.pathname}#`, path: location.hash.slice(1) };
panneau.narrow = matchMedia('(max-width: 870px)').matches;
publier();

// Accès depuis la console :
//   mock.basculer('binary_sensor.lave_linge')
//   mock.definir('sensor.tablette_battery_level', '15')
window.mock = {
  states,
  basculer: (id) => callService(id.split('.')[0], 'toggle', { entity_id: id }),
  definir: (id, state) => {
    definir(id, state, states[id]?.attributes.friendly_name ?? id);
    publier();
  },
};

// Taille d'écran en pixels CSS : ouvrir /dev/ sur la vraie tablette pour relever sa taille de référence
const taille = document.createElement('div');
taille.style.cssText = 'position:fixed; right:8px; bottom:8px; z-index:9999; padding:4px 8px; border-radius:6px;'
  + 'background:#000c; color:#8B9AB0; font:12px monospace; pointer-events:none;';
const afficherTaille = () => {
  taille.textContent = `${innerWidth}×${innerHeight} CSS px · DPR ${devicePixelRatio}`;
};
afficherTaille();
addEventListener('resize', afficherTaille);
document.body.append(taille);
