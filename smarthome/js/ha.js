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
