// =============================================
// MOCK-HASS.JS — Faux objet hass pour développer sans Home Assistant
// =============================================
// Reproduit le contrat utilisé par le panneau : states, config, connected, callService.
// Chaque changement d'état crée un nouvel objet hass, comme le fait Home Assistant.

import '../smarthome-panel.js';
import config from '../js/config.js';
import budgetExemple from './budget-exemple.js';
import { creerMenuSimule } from './mock-menu.js';
import { creerComparateurSimule } from './mock-comparateur.js';

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

// ---- Vie : lumières (avec luminosité), appareils, caméras ----
const vie = config.VIE ?? {};
const avecAttributs = (id, state, attributs) => {
  definir(id, state, attributs.friendly_name ?? id);
  Object.assign(states[id].attributes, attributs);
};
(vie.pieces ?? []).forEach((piece) => piece.lumieres.forEach((l, i) => {
  const allumee = i !== 2;
  avecAttributs(l.id, allumee ? 'on' : 'off', { friendly_name: l.nom, brightness: allumee ? Math.round(((65 - i * 15) / 100) * 255) : null });
}));
const appareilsVie = vie.appareils ?? {};
if (appareilsVie.aspirateur) avecAttributs(appareilsVie.aspirateur, 'docked', { friendly_name: 'Aspirateur' });
if (appareilsVie.tv) avecAttributs(appareilsVie.tv, 'off', { friendly_name: 'TV' });
if (appareilsVie.thermostat) avecAttributs(appareilsVie.thermostat, 'heat', { friendly_name: 'Thermostat', current_temperature: 21.5 });
(appareilsVie.prises ?? []).forEach((id, i) => avecAttributs(id, i < 3 ? 'on' : 'off', { friendly_name: `Prise ${id.split('_').pop()}` }));
(vie.cameras ?? []).forEach((c, i) => avecAttributs(c.id, 'idle', {
  friendly_name: c.nom,
  entity_picture: `/dev/images-locales/camera-${i === 0 ? 'salon' : 'entree'}.png?token=demo`,
}));
if (vie.sceneLumiereDouce) avecAttributs(vie.sceneLumiereDouce, 'unknown', { friendly_name: 'Lumière douce' });
// Dans HA, cet événement ouvre la fiche native de l'entité
window.addEventListener('hass-more-info', (e) => console.info('[mock] fiche HA demandée :', e.detail.entityId));

const panneau = document.querySelector('smarthome-panel');

async function callService(domaine, service, donnees) {
  await new Promise((r) => setTimeout(r, LATENCE_MS));
  const { entity_id: cibles } = donnees;
  // Liste de courses fictive (todo.courses) : mêmes services que l'intégration Liste de tâches locale
  if (domaine === 'todo' && cibles === 'todo.courses') {
    if (service === 'remove_item') {
      const uids = [].concat(donnees.item);
      for (let i = articlesCourses.length - 1; i >= 0; i -= 1) if (uids.includes(articlesCourses[i].uid)) articlesCourses.splice(i, 1);
    } else if (service === 'add_item') {
      articlesCourses.push({ uid: crypto.randomUUID(), summary: donnees.item, description: donnees.description ?? null, status: 'needs_action' });
    } else if (service === 'update_item') {
      const article = articlesCourses.find((x) => x.uid === donnees.item);
      if (!article) throw new Error('Article inconnu');
      if (donnees.status) article.status = donnees.status;
      if (donnees.rename) article.summary = donnees.rename;
      if ('description' in donnees) article.description = donnees.description;
    } else if (service === 'remove_completed_items') {
      for (let i = articlesCourses.length - 1; i >= 0; i -= 1) if (articlesCourses[i].status === 'completed') articlesCourses.splice(i, 1);
    }
    majEtatCourses();
    publier();
    return;
  }
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
  // Services de l'onglet Vie
  if (['scene', 'script', 'automation', 'button', 'input_button'].includes(domaine)) {
    console.info(`[mock] ${domaine}.${service} :`, cibles);
    return;
  }
  if (domaine === 'vacuum') {
    states[cibles] = { ...states[cibles], state: service === 'start' ? 'cleaning' : 'returning' };
    publier();
    return;
  }
  if (domaine === 'light' && service === 'turn_on' && donnees.brightness_pct != null) {
    for (const id of [].concat(cibles)) {
      states[id] = { ...states[id], state: donnees.brightness_pct > 0 ? 'on' : 'off',
        attributes: { ...states[id].attributes, brightness: Math.round((donnees.brightness_pct / 100) * 255) } };
    }
    publier();
    return;
  }
  for (const id of [].concat(cibles)) {
    const actuel = states[id];
    if (!actuel) throw new Error(`Entité inconnue : ${id}`);
    const suivant = service === 'toggle' ? (actuel.state === 'on' ? 'off' : 'on')
      : service === 'turn_on' ? 'on' : 'off';
    // Comme HA : une lumière allumée a une luminosité (pleine si inconnue), éteinte n'en a pas
    const attributes = id.startsWith('light.')
      ? { ...actuel.attributes, brightness: suivant === 'on' ? (actuel.attributes.brightness ?? 255) : null }
      : actuel.attributes;
    states[id] = { ...actuel, state: suivant, attributes };
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

// ---- Menu simulé (dev/mock-menu.js) et liste de courses todo.courses fictive ----
// Quelques articles de départ ; « Piles » a été ajouté depuis l'application HA (sans format commun)
const articlesCourses = [
  { uid: 'c-1', summary: 'Tomates — 500 g', description: 'qte=500;unite=g;rayon=fruits-legumes;source=manuel', status: 'needs_action', cle: 'tomate|g', nom: 'Tomates', qte: 500 },
  { uid: 'c-2', summary: 'Yaourts nature — 12 pièce(s)', description: 'qte=12;unite=piece;rayon=cremerie;source=manuel', status: 'needs_action', cle: 'yaourt nature|piece', nom: 'Yaourts nature', qte: 12 },
  { uid: 'c-3', summary: 'Baguette — 2 pièce(s)', description: 'qte=2;unite=piece;rayon=boulangerie;source=manuel', status: 'completed', cle: 'baguette|piece', nom: 'Baguette', qte: 2 },
  { uid: 'c-4', summary: 'Liquide vaisselle — 1 pièce(s)', description: 'qte=1;unite=piece;rayon=entretien;source=manuel', status: 'needs_action', cle: 'liquide vaisselle|piece', nom: 'Liquide vaisselle', qte: 1 },
  { uid: 'c-5', summary: 'Piles', description: null, status: 'needs_action' },
];
const majEtatCourses = () => definir('todo.courses', String(articlesCourses.filter((x) => x.status === 'needs_action').length), 'Courses');
majEtatCourses();
const menuSimule = creerMenuSimule({ erreur: erreurWS, courses: articlesCourses });
// Dernières courses et comparateur (dev/mock-comparateur.js) ; total visible seulement avec un jeton Budget
const comparateurSimule = creerComparateurSimule({ erreur: erreurWS, jetonValide: (jeton) => budget.jetons.has(jeton) });
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
      // todo.courses : liste de courses alimentée par le menu ; les autres : tâches du calendrier
      if (message.entity_id === 'todo.courses') {
        return { items: articlesCourses.map(({ uid, summary, status, description }) => ({ uid, summary, status, description })) };
      }
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
      if (message.type.startsWith('maison/menu/') || message.type.startsWith('maison/jus/')) return menuSimule.commande(message);
      if (message.type.startsWith('maison/courses/')) return comparateurSimule.commande(message);
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
// Bouton « Retour » du navigateur : HA renverrait une nouvelle route, le mock fait pareil
addEventListener('popstate', () => {
  panneau.route = { prefix: `${location.pathname}#`, path: location.hash.slice(1) };
});
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
  menu: menuSimule,                                  // mock.menu.etat.indisponible = true, mock.menu.vider()
  courses: articlesCourses,
  comparateur: comparateurSimule,                    // mock.comparateur.passages
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
