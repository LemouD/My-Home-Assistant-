// =============================================
// PIECE.JS — Détail d'une pièce : lumières une à une
// =============================================
// Adresse : vie/piece/<id> (id déclaré dans config.VIE.pieces).
// La photo de la pièce vient de config (ex. /local/images/salon.jpg, déposée
// dans Home Assistant) : aucune photo de l'intérieur du foyer dans le repo.

import { el, remplacer } from '../../../js/dom.js';
import {
  aChange, basculer, commanderLumieres, estActif, luminosite, nom, reglerLuminosite,
} from '../../../js/ha.js';

const ICONES_LUMIERE = ['plafonnier', 'lampe', 'lampe-tv', 'bandeau'];
const icone = (fichier) => new URL(`../../../assets/icons/vie/${fichier}`, import.meta.url).href;
const img = (fichier, taille) => el('img', { src: icone(`${fichier}.svg`), width: taille, height: taille, alt: '' });

export async function monter({ config, parametre }) {
  const piece = (config.VIE?.pieces ?? []).find((p) => p.id === parametre);
  const racine = el('div', { class: 'vie' });

  const retour = el('a', { class: 'vie-fil', 'data-vue': 'vie' }, img('retour', 14), 'Vie / Maison');

  if (!piece) {
    racine.append(retour, el('p', { class: 'vie-vide' }, 'Pièce introuvable dans la configuration.'));
    return { racine };
  }

  const ids = piece.lumieres.map((l) => l.id);
  let hass = null;
  let precedent = null;
  let glissement = false;          // pas de rafraîchissement pendant qu'un curseur est tenu
  const enCours = new Set();

  // ---- STRUCTURE FIXE ----

  const boutonTout = (allumer) => el('button', {
    class: 'vie-segment', 'data-action': allumer ? 'tout-allumer' : 'tout-eteindre',
  }, img(allumer ? 'allumer' : 'eteindre', 16), allumer ? 'ON' : 'OFF');

  const segments = el('div', { class: 'vie-segments', role: 'group', 'aria-label': 'Toutes les lumières' },
    boutonTout(true), boutonTout(false));
  const liste = el('div', { class: 'vie-liste' });

  racine.append(
    el('div', { class: 'vie-entete' },
      el('div', {},
        retour,
        el('h1', { class: 'vie-titre' }, piece.nom),
        el('p', { class: 'vie-sous-titre' }, piece.sousTitre ?? 'Lumières')),
      el('div', { class: 'vie-pastille' }, img('foyer', 16), el('span', { class: 'vie-foyer' }, 'Notre Foyer'))),

    el('section', { class: 'vie-carte vie-controle-global' },
      el('div', { class: 'vie-apercu-piece' },
        piece.image && el('img', { class: 'vie-apercu-image', src: piece.image, alt: '' }),
        el('span', { class: 'vie-camera-voile' }),
        el('span', { class: 'vie-direct' }, img('canape', 13), piece.nom.toUpperCase()),
        el('b', {}, `Éclairage — ${piece.nom}`)),
      el('div', { class: 'vie-controle-tout' },
        el('span', { class: 'vie-icone vie-icone-xl' }, img('ampoule-grande', 24)),
        el('div', { class: 'vie-details' },
          el('b', { class: 'vie-section-titre' }, 'Toutes les lumières'),
          el('span', {}, `Contrôle global — ${piece.nom}`)),
        segments)),

    el('section', { class: 'vie-carte' },
      el('div', { class: 'vie-section-entete' },
        el('span', { class: 'vie-icone' }, img('ampoule-section', 17)),
        el('div', {},
          el('h2', { class: 'vie-section-titre' }, `Lumières — ${piece.nom}`),
          el('p', { class: 'vie-section-texte' }, 'Réglage individuel de chaque lumière'))),
      liste),
  );

  // ---- LUMIÈRES ----

  function rendre() {
    if (glissement) return;
    const auMoinsUne = ids.some((id) => estActif(hass, id));
    segments.querySelector('[data-action="tout-allumer"]').classList.toggle('actif', auMoinsUne);
    segments.querySelector('[data-action="tout-eteindre"]').classList.toggle('actif', !auMoinsUne);

    remplacer(liste, ...piece.lumieres.map((l) => {
      const actif = estActif(hass, l.id);
      const pct = luminosite(hass, l.id);
      const occupe = enCours.has(l.id);
      const icon = ICONES_LUMIERE.includes(l.icone) ? l.icone : 'plafonnier';
      return el('div', { class: actif ? 'vie-lumiere actif' : 'vie-lumiere', 'data-entite': l.id },
        el('span', { class: 'vie-icone vie-icone-grand vie-lumiere-icone' },
          el('span', { class: `vie-masque vie-masque-${icon}` })),
        el('div', { class: 'vie-lumiere-infos' },
          el('b', {}, nom(hass, l.id, l.nom)),
          el('span', { class: 'vie-lumiere-etat' },
            el('span', { class: 'vie-statut' }, el('span', { class: 'vie-statut-point' }), actif ? 'ON' : 'OFF'),
            actif && el('b', { class: 'vie-texte-violet vie-pct' }, `${pct} %`))),
        el('span', { class: 'vie-separateur-vertical' }),
        el('label', { class: 'vie-intensite' },
          el('input', {
            type: 'range', min: 1, max: 100, step: 1, value: actif ? pct : 1,
            class: 'vie-curseur', 'data-entite': l.id, disabled: occupe,
            'aria-label': `Luminosité — ${nom(hass, l.id, l.nom)}`,
            style: `--valeur: ${actif ? pct : 0}%`,
          }),
          el('span', { class: 'vie-echelle' }, el('span', {}, '0 %'), el('span', {}, '100 %'))),
        el('button', {
          class: actif ? 'vie-alimentation actif' : 'vie-alimentation',
          'data-action': 'basculer', 'data-entite': l.id, disabled: occupe, 'aria-pressed': String(actif),
        }, el('span', { class: 'vie-repere' }, 'Alimentation'), el('span', { class: 'vie-interrupteur' })));
    }));
  }

  async function executer(idsCibles, commande) {
    idsCibles.forEach((id) => enCours.add(id));
    rendre();
    try {
      await commande();
    } catch (e) {
      console.warn('Vie, lumières :', e.message);
    } finally {
      idsCibles.forEach((id) => enCours.delete(id));
      rendre();
    }
  }

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible || !hass) return;
    switch (cible.dataset.action) {
      case 'basculer':
        executer([cible.dataset.entite], () => basculer(hass, cible.dataset.entite));
        break;
      case 'tout-allumer':
        executer(ids, () => commanderLumieres(hass, ids, true));
        break;
      case 'tout-eteindre':
        executer(ids, () => commanderLumieres(hass, ids, false));
        break;
    }
  });

  // Curseur : l'affichage suit le doigt, la commande part au relâchement
  racine.addEventListener('input', (e) => {
    const curseur = e.target.closest('.vie-curseur');
    if (!curseur) return;
    glissement = true;
    curseur.style.setProperty('--valeur', `${curseur.value}%`);
    const pct = curseur.closest('.vie-lumiere').querySelector('.vie-pct');
    if (pct) pct.textContent = `${curseur.value} %`;
  });
  racine.addEventListener('change', (e) => {
    const curseur = e.target.closest('.vie-curseur');
    if (!curseur || !hass) return;
    glissement = false;
    const id = curseur.dataset.entite;
    executer([id], () => reglerLuminosite(hass, id, Number(curseur.value)));
  });

  return {
    racine,
    maj(nouveau) {
      hass = nouveau;
      if (!precedent) racine.querySelector('.vie-foyer').textContent = hass.config.location_name || 'Notre Foyer';
      if (aChange(precedent, hass, ids)) rendre();
      precedent = hass;
    },
  };
}
