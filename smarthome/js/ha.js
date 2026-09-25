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
