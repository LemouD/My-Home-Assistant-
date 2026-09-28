// =============================================
// ACCUEIL.JS — Vue principale de l'onglet Vie
// =============================================

import { chargerGabarit, el, remplacer } from '../../../js/dom.js';
import {
  activer, aChange, basculer, estActif, etat, imageCamera, luminosite, nom, ouvrirFiche,
} from '../../../js/ha.js';
import { horairesPriere, prochainePriere } from '../../../js/prayer.js';
import { compteRamadan, rappelDuJour } from '../../../js/spiritualite.js';
import { citationDuJour } from '../../../js/citation.js';
import { CITATIONS_SECOURS } from '../contenus.js';

const RAFRAICHISSEMENT_CAMERAS_MS = 10_000;
const icone = (fichier) => new URL(`../../../assets/icons/vie/${fichier}`, import.meta.url).href;
const img = (fichier, taille) => el('img', { src: icone(`${fichier}.svg`), width: taille, height: taille, alt: '' });

const ETATS_ASPIRATEUR = {
  cleaning: 'En nettoyage',
  docked: 'À la base',
  idle: 'En veille',
  paused: 'En pause',
  returning: 'Retour à la base',
  error: 'Erreur',
};
const ETATS_TV = { on: 'Allumée', playing: 'Lecture en cours', paused: 'En pause', idle: 'En veille', off: 'Éteinte', standby: 'En veille' };

export async function monter({ config }) {
  const racine = el('div');
  racine.append(await chargerGabarit(new URL('./accueil.html', import.meta.url)));
  const $ = (id) => racine.querySelector(`#${id}`);

  const vie = config.VIE ?? {};
  const scenarios = vie.scenarios ?? [];
  const pieces = vie.pieces ?? [];
  const cameras = vie.cameras ?? [];
  const appareils = vie.appareils ?? {};
  const prises = appareils.prises ?? [];

  const idsPieces = pieces.flatMap((p) => p.lumieres.map((l) => l.id));
  const idsAppareils = [appareils.aspirateur, appareils.tv, appareils.thermostat, ...prises].filter(Boolean);
  const idsCameras = cameras.map((c) => c.id);

  let hass = null;
  let precedent = null;
  let prisesOuvertes = false;
  const enCours = new Set();
  const minuteurs = [];

  // ---- ACTIONS RAPIDES ----

  function rendreScenarios() {
    remplacer($('vie-scenarios'), ...scenarios.flatMap((s, i) => [
      i > 0 && el('span', { class: 'vie-separateur' }),
      el('div', { class: 'vie-scenario' },
        el('span', { class: 'vie-icone vie-icone-grand' }, img(s.icone, 20)),
        el('div', { class: 'vie-details' },
          el('b', {}, s.nom),
          el('span', {}, s.description)),
        el('button', {
          class: 'vie-bouton', 'data-action': 'scenario', 'data-entite': s.entite, disabled: enCours.has(s.entite),
        }, enCours.has(s.entite) ? '…' : s.action ?? 'Activer')),
    ]));
    if (!scenarios.length) remplacer($('vie-scenarios'), el('p', { class: 'vie-vide' }, 'Aucun scénario configuré.'));
  }

  // ---- PIÈCES ----

  function rendrePieces() {
    remplacer($('vie-pieces'), ...pieces.map((p) => {
      const allumees = p.lumieres.filter((l) => estActif(hass, l.id));
      const moyenne = allumees.length
        ? Math.round(allumees.reduce((t, l) => t + luminosite(hass, l.id), 0) / allumees.length) : 0;
      return el('a', { class: 'vie-piece', 'data-vue': `vie/piece/${p.id}` },
        el('span', { class: 'vie-icone vie-icone-ambre' }, img('ampoule', 17)),
        el('span', { class: 'vie-details' },
          el('b', {}, p.nom),
          el('span', { class: 'vie-resume' },
            `${allumees.length} / ${p.lumieres.length} allumée${allumees.length > 1 ? 's' : ''}`,
            allumees.length > 0 && el('span', { class: 'vie-point' }),
            allumees.length > 0 && el('span', { class: 'vie-texte-ambre' }, `Luminosité ${moyenne} %`))),
        el('span', { class: 'vie-ouvrir' }, 'Ouvrir', img('chevron-violet', 14)));
    }));
    if (!pieces.length) remplacer($('vie-pieces'), el('p', { class: 'vie-vide' }, 'Aucune pièce configurée.'));
  }

  // ---- CAMÉRAS ----
  // Image fixe fournie par HA, renouvelée toutes les 10 s ; l'agrandissement ouvre le flux en direct de HA.

  function rendreCameras() {
    remplacer($('vie-cameras'), ...cameras.map((c) => {
      const url = imageCamera(hass, c.id);
      return el('div', { class: 'vie-camera', 'data-camera': c.id },
        url ? el('img', { class: 'vie-camera-image', src: url, alt: `Caméra ${c.nom}` })
          : el('p', { class: 'vie-camera-absente' }, 'Caméra indisponible'),
        el('span', { class: 'vie-camera-voile' }),
        el('span', { class: 'vie-direct' }, el('span', { class: 'vie-direct-point' }), 'APERÇU'),
        el('div', { class: 'vie-camera-infos' },
          el('b', {}, c.nom),
          el('button', { class: 'vie-camera-agrandir', 'data-action': 'fiche', 'data-entite': c.id, 'aria-label': `Voir ${c.nom} en direct` },
            img('agrandir', 14))));
    }));
    if (!cameras.length) remplacer($('vie-cameras'), el('p', { class: 'vie-vide' }, 'Aucune caméra configurée.'));
  }

  function rafraichirImagesCameras() {
    racine.querySelectorAll('.vie-camera').forEach((carte) => {
      const url = imageCamera(hass, carte.dataset.camera);
      const image = carte.querySelector('.vie-camera-image');
      if (url && image) image.src = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
    });
  }

  // ---- APPAREILS ----

  function ligneAppareil({ icone: nomIcone, titre, detail, action }) {
    return el('div', { class: 'vie-appareil' },
      el('span', { class: 'vie-icone' }, img(nomIcone, 17)),
      el('span', { class: 'vie-details' }, el('b', {}, titre), el('span', {}, detail)),
      action);
  }

  function rendreAppareils() {
    const lignes = [];
    const chevron = (id, libelle) => el('button', { class: 'vie-chevron', 'data-action': 'fiche', 'data-entite': id, 'aria-label': libelle },
      img('chevron-appareil', 15));

    if (appareils.aspirateur) {
      const statut = etat(hass, appareils.aspirateur)?.state;
      const occupe = statut === 'cleaning' || enCours.has(appareils.aspirateur);
      lignes.push(ligneAppareil({
        icone: 'aspirateur',
        titre: nom(hass, appareils.aspirateur, 'Aspirateur'),
        detail: ETATS_ASPIRATEUR[statut] ?? 'Indisponible',
        action: el('button', { class: 'vie-bouton', 'data-action': 'scenario', 'data-entite': appareils.aspirateur, disabled: occupe || !statut },
          img('lecture', 15), occupe ? 'En cours' : 'Lancer'),
      }));
    }
    if (appareils.tv) {
      lignes.push(ligneAppareil({
        icone: 'tv',
        titre: nom(hass, appareils.tv, 'TV'),
        detail: ETATS_TV[etat(hass, appareils.tv)?.state] ?? 'Indisponible',
        action: chevron(appareils.tv, 'Ouvrir la TV'),
      }));
    }
    if (appareils.thermostat) {
      const t = etat(hass, appareils.thermostat)?.attributes.current_temperature;
      lignes.push(ligneAppareil({
        icone: 'thermometre-appareil',
        titre: 'Thermostat',
        detail: t != null ? `${Number(t).toLocaleString('fr-FR')} °C` : 'Indisponible',
        action: chevron(appareils.thermostat, 'Ouvrir le thermostat'),
      }));
    }
    if (prises.length) {
      const actives = prises.filter((id) => estActif(hass, id)).length;
      lignes.push(ligneAppareil({
        icone: 'prise-appareil',
        titre: 'Prises',
        detail: `${actives} active${actives > 1 ? 's' : ''}`,
        action: el('button', {
          class: prisesOuvertes ? 'vie-chevron vie-chevron-ouvert' : 'vie-chevron',
          'data-action': 'prises', 'aria-expanded': String(prisesOuvertes), 'aria-label': 'Afficher les prises',
        }, img('chevron-appareil', 15)),
      }));
      if (prisesOuvertes) {
        lignes.push(el('div', { class: 'vie-sous-liste' }, ...prises.map((id) => {
          const actif = estActif(hass, id);
          return el('button', {
            class: actif ? 'vie-interrupteur-ligne actif' : 'vie-interrupteur-ligne',
            'data-action': 'basculer', 'data-entite': id, 'aria-pressed': String(actif), disabled: enCours.has(id),
          }, el('span', {}, nom(hass, id, id)), el('span', { class: 'vie-interrupteur' }));
        })));
      }
    }
    remplacer($('vie-appareils'), ...lignes);
    if (!lignes.length) remplacer($('vie-appareils'), el('p', { class: 'vie-vide' }, 'Aucun appareil configuré.'));
    $('vie-acces-temperature').hidden = !appareils.thermostat;
  }

  // ---- BIEN-ÊTRE ----

  async function rendrePriere() {
    try {
      const { latitude, longitude } = hass.config;
      const horaires = await horairesPriere({ latitude, longitude, methode: config.METHODE_PRIERE });
      const { priere } = prochainePriere(horaires);
      $('vie-prochaine-priere').textContent = `Prochaine prière — ${priere.nom} — ${priere.heure}`;
    } catch (e) {
      $('vie-prochaine-priere').textContent = 'Horaires de prière indisponibles';
      console.warn('Vie, prières :', e.message);
    }
  }

  function rendreCalendrier() {
    const rappel = rappelDuJour();
    $('vie-rappel').hidden = !rappel;
    if (rappel) {
      $('vie-rappel-titre').textContent = rappel.titre;
      $('vie-rappel-texte').textContent = rappel.texte;
    }

    const ramadan = compteRamadan();
    $('vie-ramadan').hidden = !ramadan;
    if (ramadan?.jourRamadan) {
      $('vie-ramadan-titre').textContent = 'Ramadan';
      $('vie-ramadan-jours').textContent = `Jour ${ramadan.jourRamadan}`;
      $('vie-ramadan-texte').textContent = 'Que ce mois apporte paix et patience au foyer.';
    } else if (ramadan) {
      $('vie-ramadan-jours').textContent = `J-${ramadan.jours} avant le Ramadan`;
      $('vie-ramadan-texte').textContent = `Le Ramadan commence dans environ ${ramadan.jours} jours (date estimée). Préparez votre intention et votre routine.`;
    }
  }

  async function rendreCitation() {
    const citation = await citationDuJour(CITATIONS_SECOURS);
    $('vie-citation').textContent = `« ${citation.texte} »`;
    $('vie-citation-auteur').textContent = citation.auteur ? `— ${citation.auteur}` : '';
  }

  // ---- ACTIONS ----

  async function executer(id, commande) {
    enCours.add(id);
    rendreScenarios();
    rendreAppareils();
    try {
      await commande();
    } catch (e) {
      console.warn('Vie, commande :', e.message);
    } finally {
      enCours.delete(id);
      rendreScenarios();
      rendreAppareils();
    }
  }

  racine.addEventListener('click', (e) => {
    const cible = e.target.closest('[data-action]');
    if (!cible || !hass) return;
    const id = cible.dataset.entite;
    switch (cible.dataset.action) {
      case 'scenario':
        executer(id, () => activer(hass, id));
        break;
      case 'basculer':
        executer(id, () => basculer(hass, id));
        break;
      case 'fiche':
        ouvrirFiche(racine, id);
        break;
      case 'thermostat':
        ouvrirFiche(racine, appareils.thermostat);
        break;
      case 'prises':
        prisesOuvertes = !prisesOuvertes;
        rendreAppareils();
        break;
      case 'voir-appareils':
        $('vie-carte-appareils').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  });

  rendreScenarios();
  rendreCalendrier();
  rendreCitation();

  // ---- CYCLE DE VIE ----

  return {
    racine,

    maj(nouveau) {
      hass = nouveau;
      if (!precedent) {
        $('vie-foyer').textContent = hass.config.location_name || 'Notre Foyer';
        rendreCameras();
        rendrePriere();
        minuteurs.push(setInterval(rafraichirImagesCameras, RAFRAICHISSEMENT_CAMERAS_MS));
        minuteurs.push(setInterval(() => { rendrePriere(); rendreCalendrier(); }, 60_000));
      }
      if (aChange(precedent, hass, idsPieces)) rendrePieces();
      if (aChange(precedent, hass, idsAppareils)) rendreAppareils();
      if (precedent && aChange(precedent, hass, idsCameras)) rendreCameras();
      precedent = hass;
    },

    detruire() {
      minuteurs.forEach(clearInterval);
    },
  };
}
