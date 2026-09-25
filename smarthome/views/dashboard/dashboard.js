// =============================================
// DASHBOARD.JS — Vue page d'accueil
// =============================================

import { chargerGabarit, el } from '../../js/dom.js';
import { aChange, basculer, commanderLumieres, estActif, nom } from '../../js/ha.js';
import { demarrerMeteo } from '../../js/weather.js';
import { demarrerPrieres } from '../../js/prayer.js';

export async function monter({ config }) {
  const racine = el('div', { class: 'vue-dashboard' });
  racine.append(await chargerGabarit(new URL('./dashboard.html', import.meta.url)));
  const $ = (id) => racine.querySelector(`#${id}`);

  const idsLumieres = config.LUMIERES.map((l) => l.id);
  const idsAlertes = config.ALERTES.map((a) => a.id);

  let hass = null;
  let precedent = null;
  const arrets = [];
  const enCours = new Set();   // lumières en attente de réponse de HA
  const enErreur = new Set();  // lumières dont la dernière commande a échoué
  let alertesFermees = null;   // signature des alertes masquées par l'utilisateur

  // ---- LUMIÈRES ----

  function rendreLumieres() {
    let allumees = 0;
    $('lumieres-grid').replaceChildren(...config.LUMIERES.map((l) => {
      const isOn = estActif(hass, l.id);
      if (isOn) allumees++;
      const classes = ['lumiere-btn', isOn && 'on', enErreur.has(l.id) && 'erreur'].filter(Boolean).join(' ');
      return el('button', {
        class: classes,
        'data-action': 'basculer',
        'data-entity': l.id,
        disabled: enCours.has(l.id),
        title: isOn ? 'Allumée — cliquer pour éteindre' : 'Éteinte — cliquer pour allumer',
      },
        el('span', { class: 'lumiere-icon' }, isOn ? '💡' : '🔦'),
        el('span', { class: 'lumiere-nom' }, nom(hass, l.id, l.nom)),
      );
    }));

    const compteur = $('lumieres-count');
    compteur.textContent = `${allumees} allumée(s)`;
    compteur.style.display = allumees > 0 ? '' : 'none';
  }

  // Pas de mise à jour optimiste : le bouton change quand HA confirme le nouvel état,
  // ce qui arrive en temps réel via la connexion WebSocket de hass.
  async function executer(ids, commande) {
    ids.forEach((id) => { enCours.add(id); enErreur.delete(id); });
    rendreLumieres();
    try {
      await commande();
    } catch (e) {
      console.warn('Commande lumière échouée :', e.message);
      ids.forEach((id) => enErreur.add(id));
      setTimeout(() => { ids.forEach((id) => enErreur.delete(id)); rendreLumieres(); }, 3000);
    } finally {
      ids.forEach((id) => enCours.delete(id));
      rendreLumieres();
    }
  }

  // ---- ALERTES ----

  function rendreAlertes() {
    const barre = $('alert-bar');
    const actives = config.ALERTES.filter((a) => estActif(hass, a.id));
    const signature = actives.map((a) => a.id).join(',');

    // Masquée s'il n'y a rien, ou si l'utilisateur a fermé exactement ces alertes-là
    if (actives.length === 0 || signature === alertesFermees) {
      barre.classList.add('hidden');
      return;
    }

    barre.replaceChildren(
      ...actives.flatMap((a, i) => [
        ...(i > 0 ? [el('span', { class: 'alert-sep' }, '|')] : []),
        el('span', { class: 'alert-item' },
          el('span', { class: 'alert-icon' }, a.icone),
          el('span', { class: 'alert-label' }, a.libelle ?? nom(hass, a.id)),
          el('span', { class: 'alert-dot' }),
        ),
      ]),
      el('button', { class: 'alert-fermer', 'data-action': 'fermer-alertes' }, '✕ Fermer'),
    );
    barre.dataset.signature = signature;
    barre.classList.remove('hidden');
  }

  // ---- ACTIONS ----

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible || !hass) return;

    switch (cible.dataset.action) {
      case 'basculer': {
        const id = cible.dataset.entity;
        executer([id], () => basculer(hass, id));
        break;
      }
      case 'tout-allumer':
        executer(idsLumieres, () => commanderLumieres(hass, idsLumieres, true));
        break;
      case 'tout-eteindre':
        executer(idsLumieres, () => commanderLumieres(hass, idsLumieres, false));
        break;
      case 'fermer-alertes':
        alertesFermees = $('alert-bar').dataset.signature;
        rendreAlertes();
        break;
    }
  });

  // ---- CYCLE DE VIE ----

  return {
    racine,

    // Appelée à chaque mise à jour de hass (plusieurs fois par seconde possible)
    maj(nouveau) {
      hass = nouveau;

      if (!precedent) {
        const { latitude, longitude, time_zone: fuseau } = hass.config;
        arrets.push(demarrerMeteo(racine, { latitude, longitude, fuseau }, config.REFRESH_METEO));
        arrets.push(demarrerPrieres(racine, { latitude, longitude, methode: config.METHODE_PRIERE }));
      }

      if (aChange(precedent, hass, idsLumieres)) rendreLumieres();
      if (aChange(precedent, hass, idsAlertes)) rendreAlertes();
      precedent = hass;
    },

    detruire() {
      arrets.forEach((arreter) => arreter());
    },
  };
}
