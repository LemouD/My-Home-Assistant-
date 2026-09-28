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

const energie = config.ENERGIE ?? {};
if (energie.eau?.index) definir(energie.eau.index, '1247.318', 'Index eau');
if (energie.eau?.saisie) definir(energie.eau.saisie, '1247.318', 'Saisie index eau');
(energie.temperatures ?? []).forEach((id, i) => definir(id, String(20.4 + i * 0.8), `Température ${i + 1}`));

// ---- Calendrier familial simulé : événements fictifs, datés par rapport à aujourd'hui ----
const cal = config.CALENDRIER ?? {};
const idsCalendriers = (cal.calendriers ?? []).map((c) => c.id);
const deuxChiffres = (n) => String(n).padStart(2, '0');
const jourTexte = (d) => `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
const dansJours = (n, h = null, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  if (h === null) return jourTexte(d);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const idCal = (i) => idsCalendriers[i % Math.max(idsCalendriers.length, 1)];
const jourRrule = (n) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(Date.now() + n * 86400000).getDay()];
const evenementsCalendrier = idsCalendriers.length ? [
  { calendrier: idCal(3), summary: 'Déposer les enfants', dtstart: dansJours(0, 8), dtend: dansJours(0, 8, 30), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { calendrier: idCal(0), summary: 'Dîner en famille', dtstart: dansJours(0, 19, 30), dtend: dansJours(0, 21) },
  { calendrier: idCal(1), summary: 'Rendez-vous médecin', dtstart: dansJours(2, 14), dtend: dansJours(2, 15) },
  { calendrier: idCal(2), summary: 'Anniversaire Membre 2', dtstart: dansJours(3), dtend: dansJours(4), rrule: 'FREQ=YEARLY' },
  { calendrier: idCal(4), summary: 'Sport', dtstart: dansJours(5, 17, 30), dtend: dansJours(5, 18, 30), rrule: `FREQ=WEEKLY;BYDAY=${jourRrule(5)}` },
  { calendrier: idCal(3), summary: 'Réunion parents', dtstart: dansJours(10, 18), dtend: dansJours(10, 19) },
  { calendrier: idCal(2), summary: 'Anniversaire Enfant 1', dtstart: dansJours(-6), dtend: dansJours(-5), rrule: 'FREQ=YEARLY' },
  { calendrier: idCal(0), summary: 'Courses de la semaine', dtstart: dansJours(-2, 10), dtend: dansJours(-2, 11) },
] : [];
evenementsCalendrier.forEach((e, i) => { e.uid = `demo-${i}`; });
idsCalendriers.forEach((id) => definir(id, 'off', id));
(cal.membres ?? []).forEach((m, i) => {
  if (m.personne && !states[m.personne]) definir(m.personne, 'home', i < 2 ? `Membre ${i + 1}` : `Enfant ${i - 1}`);
});

const tachesDemo = [
  { uid: 't1', summary: 'Sortir les poubelles', status: 'needs_action', due: dansJours(1) },
  { uid: 't2', summary: 'Arroser les plantes', status: 'completed', due: dansJours(2) },
  { uid: 't3', summary: 'Payer une facture', status: 'needs_action', due: dansJours(0) },
  { uid: 't4', summary: 'Acheter un cadeau', status: 'needs_action' },
];
const majEtatTaches = () => {
  if (cal.taches) definir(cal.taches, String(tachesDemo.filter((t) => t.status === 'needs_action').length), 'Tâches');
};
majEtatTaches();

// Occurrences d'un événement entre deux dates, au format de l'API REST de HA.
// Répétitions gérées : WEEKLY;BYDAY, MONTHLY, YEARLY et UNTIL (suffisant pour la démo).
function occurrences(evenement, debut, fin) {
  const journee = evenement.dtstart.length === 10;
  const lire = (t) => (journee ? new Date(`${t}T00:00`) : new Date(t));
  const depart = lire(evenement.dtstart);
  const duree = lire(evenement.dtend) - depart;
  const regle = Object.fromEntries((evenement.rrule ?? '').split(';').filter(Boolean).map((p) => p.split('=')));
  const jusqua = regle.UNTIL ? new Date(`${regle.UNTIL.slice(0, 4)}-${regle.UNTIL.slice(4, 6)}-${regle.UNTIL.slice(6, 8)}T23:59:59`) : null;
  const candidats = [];
  if (!regle.FREQ) candidats.push(depart);
  for (let d = new Date(debut.getTime() - duree - 86400000); d < fin && regle.FREQ; d.setDate(d.getDate() + 1)) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), depart.getHours(), depart.getMinutes());
    if (c < depart) continue;
    const ok = (regle.FREQ === 'WEEKLY' && (regle.BYDAY ?? '').split(',').includes(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][c.getDay()]))
      || (regle.FREQ === 'MONTHLY' && c.getDate() === depart.getDate())
      || (regle.FREQ === 'YEARLY' && c.getDate() === depart.getDate() && c.getMonth() === depart.getMonth());
    if (ok && (!jusqua || c <= jusqua)) candidats.push(c);
  }
  return candidats
    .filter((c) => c < fin && new Date(c.getTime() + duree) > debut)
    .map((c) => {
      const finOcc = new Date(c.getTime() + duree);
      return {
        summary: evenement.summary,
        uid: evenement.uid,
        rrule: evenement.rrule ?? null,
        start: journee ? { date: jourTexte(c) } : { dateTime: c.toISOString() },
        end: journee ? { date: jourTexte(finOcc) } : { dateTime: finOcc.toISOString() },
      };
    });
}

async function callApi(methode, chemin) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  const url = new URL(chemin, 'http://ha.local/api/');
  const [, id] = url.pathname.match(/calendars\/(.+)$/) ?? [];
  if (methode !== 'GET' || !idsCalendriers.includes(id)) throw new Error(`API simulée : ${methode} ${chemin}`);
  const debut = new Date(url.searchParams.get('start'));
  const fin = new Date(url.searchParams.get('end'));
  return evenementsCalendrier.filter((e) => e.calendrier === id).flatMap((e) => occurrences(e, debut, fin));
}

const panneau = document.querySelector('smarthome-panel');

async function callService(domaine, service, donnees) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  const { entity_id: cibles } = donnees;
  if (domaine === 'todo' && service === 'update_item') {
    const tache = tachesDemo.find((t) => t.uid === donnees.item);
    if (!tache) throw new Error('Tâche inconnue');
    tache.status = donnees.status;
    majEtatTaches();
    publier();
    return;
  }
  if (domaine === 'input_number' && service === 'set_value') {
    definir(cibles, String(donnees.value), states[cibles]?.attributes.friendly_name);
    // Le capteur d'index suit l'input_number, comme le template sensor décrit dans le README
    if (cibles === energie.eau?.saisie && energie.eau.index) definir(energie.eau.index, String(donnees.value), 'Index eau');
    publier();
    return;
  }
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

// ---- Statistiques longue durée simulées (recorder/statistics_during_period) ----
// Valeurs pseudo-aléatoires mais stables : même jour ou même mois = même valeur.
const bruit = (graine) => {
  const x = Math.sin(graine * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const PAR_JOUR = {                                  // valeur moyenne par jour et par capteur
  [energie.electricite?.hc]: 3.6,
  [energie.electricite?.hp]: 5.4,
  [energie.eau?.index]: 0.41,
};

function variationJour(id, jour) {
  const base = PAR_JOUR[id] ?? 1.2;                 // prises connectées : ~1,2 kWh/jour
  const graine = jour.getFullYear() * 400 + jour.getMonth() * 31 + jour.getDate() + id.length;
  return base * (0.7 + 0.6 * bruit(graine));
}

function statistiquesSimulees({ statistic_ids: ids, start_time: debut, end_time: fin, period }) {
  const maintenant = new Date(fin);
  const resultat = {};
  for (const id of ids) {
    const points = [];
    let curseur = new Date(debut);
    while (curseur < maintenant) {
      const suivant = period === 'month'
        ? new Date(curseur.getFullYear(), curseur.getMonth() + 1, 1)
        : new Date(curseur.getFullYear(), curseur.getMonth(), curseur.getDate() + 1);
      let change = 0;
      for (let j = new Date(curseur); j < suivant && j < maintenant; j.setDate(j.getDate() + 1)) {
        // Journée en cours : proportion écoulée
        const fraction = j.toDateString() === maintenant.toDateString()
          ? (maintenant.getHours() * 60 + maintenant.getMinutes()) / 1440 : 1;
        change += variationJour(id, j) * fraction;
      }
      points.push({ start: curseur.getTime(), end: suivant.getTime(), change });
      curseur = suivant;
    }
    resultat[id] = points;
  }
  return resultat;
}

async function callWS(message) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  switch (message.type) {
    case 'calendar/event/create': {
      if (!idsCalendriers.includes(message.entity_id)) throw erreurWS('not_found', 'Calendrier inconnu');
      const { summary, dtstart, dtend, rrule } = message.event;
      evenementsCalendrier.push({ calendrier: message.entity_id, summary, dtstart, dtend, rrule, uid: crypto.randomUUID() });
      console.info('[mock] événement créé :', message.event);
      return {};
    }
    case 'todo/item/list':
      return { items: structuredClone(tachesDemo) };
    case 'recorder/statistics_during_period':
      return statistiquesSimulees(message);
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
    callApi,
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
