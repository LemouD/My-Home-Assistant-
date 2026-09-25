// =============================================
// DASHBOARD.JS — Vue page d'accueil
// =============================================

import { chargerGabarit, el, remplacer } from '../../js/dom.js';
import { aChange, basculer, commanderLumieres, estActif, etat, nom } from '../../js/ha.js';
import { demarrerMeteo } from '../../js/weather.js';
import { demarrerPrieres } from '../../js/prayer.js';

export async function monter({ config }) {
  const racine = el('div', { class: 'vue-dashboard' });
  racine.append(await chargerGabarit(new URL('./dashboard.html', import.meta.url)));
  const $ = (id) => racine.querySelector(`#${id}`);

  const idsLumieres = config.LUMIERES.map((l) => l.id);
  const idsAlertes = config.ALERTES.map((a) => a.id);
  const batterie = config.BATTERIE_TABLETTE ?? {};
  const idsBatterie = [batterie.niveau, batterie.charge].filter(Boolean);

  let hass = null;
  let precedent = null;
  const arrets = [];
  const enCours = new Set();   // lumières en attente de réponse de HA
  const enErreur = new Set();  // lumières dont la dernière commande a échoué
  let alertesFermees = null;   // signature des alertes masquées par l'utilisateur

  // ---- LUMIÈRES ----

  // Icônes de pièce disponibles (assets/icons/accueil/piece-*.svg) et teintes de la maquette
  const ICONES = ['ampoule', 'cuisine', 'lit', 'bain', 'bureau', 'porte'];
  const TEINTES = ['ambre', 'bleu', 'vert', 'orange'];

  function rendreLumieres() {
    let allumees = 0;
    remplacer($('lumieres-grid'), ...config.LUMIERES.map((l) => {
      const isOn = estActif(hass, l.id);
      if (isOn) allumees++;
      const icone = ICONES.includes(l.icone) ? l.icone : 'ampoule';
      const teinte = TEINTES.includes(l.teinte) ? l.teinte : 'ambre';
      const classes = ['lumiere-btn', `teinte-${teinte}`, isOn && 'on', enErreur.has(l.id) && 'erreur']
        .filter(Boolean).join(' ');
      const nomPiece = nom(hass, l.id, l.nom);
      return el('button', {
        class: classes,
        'data-action': 'basculer',
        'data-entity': l.id,
        disabled: enCours.has(l.id),
        'aria-pressed': isOn ? 'true' : 'false',
        'aria-label': `${nomPiece} : ${isOn ? 'allumée' : 'éteinte'}`,
      },
        el('span', { class: 'lumiere-cercle' }, el('span', { class: `lumiere-icone icone-${icone}` })),
        el('span', { class: 'lumiere-texte' },
          el('span', { class: 'lumiere-nom' }, nomPiece),
          el('span', { class: 'lumiere-etat' }, isOn ? 'Allumée' : 'Éteinte'),
        ),
      );
    }));

    $('lumieres-count').textContent = allumees > 0 ? `${allumees} / ${config.LUMIERES.length} allumées` : '';
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

  // ---- BATTERIE TABLETTE ----

  const STATUTS_CHARGE = {
    charging: 'En charge',
    full: 'Branchée, pleine',
    discharging: 'Sur batterie',
    not_charging: 'Branchée, pas en charge',
  };

  function rendreBatterie() {
    const capteur = etat(hass, batterie.niveau);
    const valeur = Number.parseFloat(capteur?.state);
    const carte = $('batterie-card');

    // Capteur absent de HA, ou présent mais "unavailable" (tablette hors ligne)
    if (!Number.isFinite(valeur)) {
      carte.dataset.niveau = 'inconnu';
      $('batterie-pct').textContent = '--';
      $('batterie-status').textContent = capteur ? 'Tablette hors ligne' : 'Capteur de batterie introuvable';
      $('batterie-fill').style.width = '0%';
      return;
    }

    const pct = Math.round(valeur);
    const niveau = pct >= 50 ? 'bon' : pct >= 20 ? 'moyen' : 'faible';
    const statut = etat(hass, batterie.charge)?.state;

    carte.dataset.niveau = niveau;
    $('batterie-pct').textContent = pct;
    $('batterie-status').textContent = STATUTS_CHARGE[statut] ?? '';
    $('batterie-fill').style.width = `${pct}%`;
  }

  // ---- ALERTES ----

  const GRAVITES = ['info', 'attention', 'danger'];

  function rendreAlertes() {
    const barre = $('alert-bar');
    const actives = config.ALERTES.filter((a) => estActif(hass, a.id));
    const signature = actives.map((a) => a.id).join(',');

    // Masquée s'il n'y a rien, ou si l'utilisateur a fermé exactement ces alertes-là
    if (actives.length === 0 || signature === alertesFermees) {
      barre.classList.add('hidden');
      return;
    }

    // Gravité (config ALERTES → gravite) : info (bleu, par défaut), attention (ambre), danger (rouge)
    remplacer(barre,
      ...actives.map((a) => el('span', { class: `alert-item alert-${GRAVITES.includes(a.gravite) ? a.gravite : 'info'}` },
        el('span', { class: 'alert-dot' }),
        a.libelle ?? nom(hass, a.id),
      )),
      el('button', { class: 'alert-fermer', 'data-action': 'fermer-alertes' }, 'Masquer'),
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
        arrets.push(demarrerPrieres(racine, { latitude, longitude, methode: config.METHODE_PRIERE, ville: config.VILLE }));
        $('meteo-ville').textContent = config.VILLE ?? '';
      }

      if (aChange(precedent, hass, idsLumieres)) rendreLumieres();
      if (aChange(precedent, hass, idsAlertes)) rendreAlertes();
      if (aChange(precedent, hass, idsBatterie)) rendreBatterie();
      precedent = hass;
    },

    detruire() {
      arrets.forEach((arreter) => arreter());
    },
  };
}
