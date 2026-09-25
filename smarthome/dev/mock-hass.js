// =============================================
// MOCK-HASS.JS — Faux objet hass pour développer sans Home Assistant
// =============================================
// Reproduit le contrat utilisé par le panneau : states, config, connected, callService.
// Chaque changement d'état crée un nouvel objet hass, comme le fait Home Assistant.

import '../smarthome-panel.js';
import config from '../js/config.js';
import budgetExemple from './budget-exemple.js';

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

// ---- Intégration « maison » simulée (contrat WebSocket du budget) ----
// Code de démonstration : 123456. Le vrai code est défini dans Home Assistant.
const CODE_DEMO = '123456';
const budget = {
  donnees: { ...structuredClone(budgetExemple), mois: new Date().toISOString().slice(0, 7) },
  jetons: new Set(),
  echecs: 0,
  bloqueJusqua: 0,
};

const erreurWS = (code, message) => Object.assign(new Error(message), { code });
const attenteBudget = () => Math.max(0, Math.ceil((budget.bloqueJusqua - Date.now()) / 1000));
const verifierJeton = (jeton) => {
  if (!budget.jetons.has(jeton)) throw erreurWS('session_invalide', 'Session invalide');
};

async function callWS(message) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  switch (message.type) {
    case 'maison/budget/etat':
      return { configure: true, attente: attenteBudget(), essaisRestants: 5 - budget.echecs };
    case 'maison/budget/deverrouiller': {
      if (attenteBudget() > 0) throw erreurWS('bloque', 'Trop d\'essais');
      if (message.code !== CODE_DEMO) {
        budget.echecs += 1;
        if (budget.echecs >= 5) {
          budget.echecs = 0;
          budget.bloqueJusqua = Date.now() + 60_000;
          throw erreurWS('bloque', 'Trop d\'essais');   // comme l'intégration : le 5e échec bloque
        }
        throw erreurWS('code_invalide', 'Code incorrect');
      }
      budget.echecs = 0;
      const jeton = crypto.randomUUID();
      budget.jetons.add(jeton);
      return { jeton, duree: 600 };
    }
    case 'maison/budget/lire':
      verifierJeton(message.jeton);
      return structuredClone(budget.donnees);
    case 'maison/budget/enregistrer': {
      verifierJeton(message.jeton);
      const { mois, historique, ...modifiables } = message.donnees;
      const textes = [
        ...modifiables.epargne.comptes.map((c) => c.nom),
        ...modifiables.imprevus.map((i) => i.libelle),
        ...modifiables.facturesAVenir.map((f) => f.fournisseur),
        ...modifiables.factures.map((f) => f.fournisseur),
      ];
      if (textes.some((t) => !t.trim())) throw erreurWS('donnees_invalides', 'Libellé vide');
      Object.assign(budget.donnees, structuredClone(modifiables));
      return structuredClone(budget.donnees);
    }
    case 'maison/budget/verrouiller':
      budget.jetons.delete(message.jeton);
      return {};
    default:
      throw erreurWS('unknown_command', message.type);
  }
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
    callWS,
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
  budget,                                            // mock.budget.donnees, mock.budget.jetons…
  expirerSessions: () => budget.jetons.clear(),      // simule l'expiration côté serveur
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
