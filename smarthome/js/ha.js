// =============================================
// HA.JS — Accès à Home Assistant
// =============================================
// Seul point d'accès à l'objet `hass` fourni par le panneau :
// les vues ne lisent pas hass.states et n'appellent pas hass.callService directement.

export const etat = (hass, id) => hass?.states[id];

export const estActif = (hass, id) => etat(hass, id)?.state === 'on';

export const estPresent = (hass, id) => etat(hass, id)?.state === 'home';

// Nom affiché : celui défini dans Home Assistant, sinon la valeur de repli.
export const nom = (hass, id, defaut = id) =>
  etat(hass, id)?.attributes.friendly_name ?? defaut;

// HA remplace l'objet d'état d'une entité à chaque changement :
// comparer les références suffit pour savoir s'il faut redessiner.
export function aChange(avant, apres, ids) {
  if (!avant) return true;
  return ids.some((id) => avant.states[id] !== apres.states[id]);
}

export async function basculer(hass, entityId) {
  const domaine = entityId.split('.')[0];
  await hass.callService(domaine, 'toggle', { entity_id: entityId });
}

export async function commanderLumieres(hass, ids, allumer) {
  await hass.callService('light', allumer ? 'turn_on' : 'turn_off', { entity_id: ids });
}

// ---- BUDGET ----
// Données stockées côté serveur par l'intégration « maison » (custom_components/maison).
// Elles ne sont pas dans hass.states : il faut un jeton, obtenu en saisissant le code.
// En cas d'erreur, la promesse est rejetée avec { code, message } :
// non_configure, code_invalide, bloque, session_invalide, donnees_invalides.

export const budgetEtat = (hass) =>
  hass.callWS({ type: 'maison/budget/etat' });

export const budgetDeverrouiller = (hass, code) =>
  hass.callWS({ type: 'maison/budget/deverrouiller', code });

export const budgetLire = (hass, jeton) =>
  hass.callWS({ type: 'maison/budget/lire', jeton });

export const budgetEnregistrer = (hass, jeton, donnees) =>
  hass.callWS({ type: 'maison/budget/enregistrer', jeton, donnees });

export const budgetVerrouiller = (hass, jeton) =>
  hass.callWS({ type: 'maison/budget/verrouiller', jeton });

// ---- STATISTIQUES (énergie, eau) ----
// Statistiques longue durée du recorder de HA : consommation par jour ou par mois
// pour les capteurs à state_class total_increasing (compteur Linky, index d'eau…).
// Renvoie { entity_id: [{ debut: Date, variation: nombre }] }.

export async function statistiques(hass, ids, debut, fin, periode) {
  const reponse = await hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: debut.toISOString(),
    end_time: fin.toISOString(),
    statistic_ids: ids,
    period: periode,          // 'day' | 'month'
    types: ['change'],
  });
  return Object.fromEntries(ids.map((id) => [id, (reponse[id] ?? []).map((p) => ({
    debut: new Date(p.start),
    variation: p.change ?? 0,
  }))]));
}

export const valeurNumerique = (hass, id) => {
  const valeur = Number.parseFloat(etat(hass, id)?.state);
  return Number.isFinite(valeur) ? valeur : null;
};

export async function definirNombre(hass, entityId, valeur) {
  await hass.callService('input_number', 'set_value', { entity_id: entityId, value: valeur });
}

// ---- CALENDRIER ET TÂCHES ----
// Lecture par l'API REST de HA (session du panneau, aucun token côté client).
// Création par le WebSocket du calendrier local : c'est le seul qui accepte une règle
// de répétition (le service calendar.create_event ne la prend pas).

export const calendrierEvenements = (hass, entityId, debut, fin) =>
  hass.callApi('GET', `calendars/${encodeURIComponent(entityId)}?start=${encodeURIComponent(debut.toISOString())}&end=${encodeURIComponent(fin.toISOString())}`);

export const calendrierCreer = (hass, entityId, evenement) =>
  hass.callWS({ type: 'calendar/event/create', entity_id: entityId, event: evenement });

export const tachesLire = (hass, entityId) =>
  hass.callWS({ type: 'todo/item/list', entity_id: entityId });

export async function tacheStatut(hass, entityId, uid, terminee) {
  await hass.callService('todo', 'update_item', {
    entity_id: entityId,
    item: uid,
    status: terminee ? 'completed' : 'needs_action',
  });
}

// ---- VIE : scénarios, lumières, appareils, caméras ----

// Service appelé par un bouton « Activer / Lancer » selon le type d'entité
const ACTIVATION = {
  scene: 'turn_on',
  script: 'turn_on',
  automation: 'trigger',
  vacuum: 'start',
  button: 'press',
  input_button: 'press',
};

export async function activer(hass, entityId) {
  const domaine = entityId.split('.')[0];
  const service = ACTIVATION[domaine];
  if (!service) throw new Error(`Activation non prise en charge : ${domaine}`);
  await hass.callService(domaine, service, { entity_id: entityId });
}

export const luminosite = (hass, id) => {
  const brut = etat(hass, id)?.attributes.brightness;
  return estActif(hass, id) && brut != null ? Math.round((brut / 255) * 100) : 0;
};

export async function reglerLuminosite(hass, entityId, pourcent) {
  await hass.callService('light', 'turn_on', { entity_id: entityId, brightness_pct: pourcent });
}

// Image fixe d'une caméra (URL signée fournie par HA, renouvelée par HA)
export const imageCamera = (hass, id) => etat(hass, id)?.attributes.entity_picture ?? null;

// Ouvre la fiche native de Home Assistant (flux caméra en direct, thermostat, TV…)
export function ouvrirFiche(element, entityId) {
  element.dispatchEvent(new CustomEvent('hass-more-info', {
    detail: { entityId },
    bubbles: true,
    composed: true,
  }));
}

// ---- MENU ----
// Génération et stockage côté serveur (intégration « maison ») : le panneau n'appelle
// jamais le générateur lui-même. En cas d'erreur, la promesse est rejetée avec { code, message } :
// non_configure, parametres_invalides, quota_atteint, generation_en_cours, generation_invalide,
// generation_indisponible, menu_absent, courses_non_configure.

export const menuEtat = (hass) => hass.callWS({ type: 'maison/menu/etat' });

export const menuLire = (hass) => hass.callWS({ type: 'maison/menu/lire' });

export const menuGenerer = (hass, parametres) =>
  hass.callWS({ type: 'maison/menu/generer', parametres });

export const menuRemplacer = (hass, date, repas) =>
  hass.callWS({ type: 'maison/menu/remplacer', date, repas });

// recettes absent : tout le menu
export const menuVersCourses = (hass, recettes) =>
  hass.callWS({ type: 'maison/menu/vers_courses', ...(recettes ? { recettes } : {}) });

// Catalogue de jus du jour (généré au premier appel du jour, hors quota) et régénération (dans le quota)
export const jusCatalogue = (hass) => hass.callWS({ type: 'maison/jus/catalogue' });

export const jusRegenerer = (hass) => hass.callWS({ type: 'maison/jus/regenerer' });

// ---- LISTE DE COURSES ----
// Entité todo.* de la config (la même que celle des options du générateur de menu).
// Lecture : tachesLire ; cocher : tacheStatut.

export async function coursesAjouter(hass, entityId, titre, description) {
  await hass.callService('todo', 'add_item', { entity_id: entityId, item: titre, description });
}

export async function coursesModifier(hass, entityId, uid, titre, description) {
  await hass.callService('todo', 'update_item', { entity_id: entityId, item: uid, rename: titre, description });
}

export async function coursesRetirerCoches(hass, entityId) {
  await hass.callService('todo', 'remove_completed_items', { entity_id: entityId });
}

// ---- DERNIÈRES COURSES ET COMPARATEUR (intégration « maison ») ----
// Les prix et le comparateur se lisent sans code ; le total d'un passage n'est renvoyé
// par historique qu'avec un jeton Budget valide (sinon la clé « total » est absente).

export const coursesMagasins = (hass) => hass.callWS({ type: 'maison/courses/magasins' });

export const coursesAjouterPassage = (hass, passage) =>
  hass.callWS({ type: 'maison/courses/passage/ajouter', passage });

export const coursesHistorique = (hass, limite = 10, jeton = null) =>
  hass.callWS({ type: 'maison/courses/historique', limite, ...(jeton ? { jeton } : {}) });

export const coursesPrix = (hass, magasin, noms) => hass.callWS({ type: 'maison/courses/prix', magasin, noms });

export const coursesComparer = (hass) => hass.callWS({ type: 'maison/courses/comparer' });

export async function coursesRetirerArticles(hass, entityId, uids) {
  await hass.callService('todo', 'remove_item', { entity_id: entityId, item: uids });
}
